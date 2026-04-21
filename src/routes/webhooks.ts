import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { EcomEnv, EcomVariables } from '../types';
import * as schema from '../schema';
import { generateId, now } from '../utils';

const app = new Hono<{ Bindings: EcomEnv; Variables: EcomVariables }>();

// Stripe webhook
app.post('/stripe', async (c) => {
  if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: 'Stripe not configured' }, 503);
  }

  // Verify webhook signature
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing signature' }, 400);
  }

  const body = await c.req.text();

  // Parse signature parts
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts['t'];
  const sig = parts['v1'];

  if (!timestamp || !sig) {
    return c.json({ error: 'Invalid signature format' }, 400);
  }

  // Verify timestamp (reject events older than 5 minutes)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) {
    return c.json({ error: 'Webhook too old' }, 400);
  }

  // Verify HMAC
  const payload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(c.env.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (expectedHex !== sig) {
    return c.json({ error: 'Invalid signature' }, 400);
  }

  const event = JSON.parse(body) as { id: string; type: string; data: { object: Record<string, any> } };
  const db = drizzle(c.env.DB);

  // Idempotency check
  const processed = await db
    .select()
    .from(schema.webhookEvents)
    .where(eq(schema.webhookEvents.id, event.id))
    .get();

  if (processed) {
    return c.json({ received: true }); // Already processed
  }

  // Process event
  const obj = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const productId = obj.metadata?.product_id;
      const userId = obj.metadata?.user_id || obj.client_reference_id;

      if (obj.mode === 'subscription') {
        await db.insert(schema.subscriptions).values({
          id: generateId(),
          userId,
          productId,
          status: 'active',
          paymentProvider: 'stripe',
          providerSubscriptionId: obj.subscription,
          providerCustomerId: obj.customer,
          createdAt: now(),
        });
      } else {
        await db.insert(schema.orders).values({
          id: generateId(),
          userId,
          productId,
          status: 'completed',
          amount: obj.amount_total,
          currency: obj.currency,
          paymentProvider: 'stripe',
          paymentId: obj.payment_intent,
          paymentStatus: 'paid',
          customerEmail: obj.customer_details?.email || '',
          customerName: obj.customer_details?.name || null,
          createdAt: now(),
        });
      }
      break;
    }

    case 'customer.subscription.updated': {
      await db
        .update(schema.subscriptions)
        .set({
          status: obj.status === 'active' ? 'active' : obj.status === 'past_due' ? 'past_due' : obj.status,
          currentPeriodStart: new Date(obj.current_period_start * 1000).toISOString(),
          currentPeriodEnd: new Date(obj.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: obj.cancel_at_period_end ? 1 : 0,
          updatedAt: now(),
        })
        .where(eq(schema.subscriptions.providerSubscriptionId, obj.id));
      break;
    }

    case 'customer.subscription.deleted': {
      await db
        .update(schema.subscriptions)
        .set({ status: 'canceled', canceledAt: now(), updatedAt: now() })
        .where(eq(schema.subscriptions.providerSubscriptionId, obj.id));
      break;
    }

    case 'invoice.payment_failed': {
      if (obj.subscription) {
        await db
          .update(schema.subscriptions)
          .set({ status: 'past_due', updatedAt: now() })
          .where(eq(schema.subscriptions.providerSubscriptionId, obj.subscription));
      }
      break;
    }
  }

  // Record event as processed
  await db.insert(schema.webhookEvents).values({
    id: event.id,
    provider: 'stripe',
    type: event.type,
    processedAt: now(),
  });

  return c.json({ received: true });
});

// PayPal webhook
app.post('/paypal', async (c) => {
  if (!c.env.PAYPAL_CLIENT_ID || !c.env.PAYPAL_CLIENT_SECRET) {
    return c.json({ error: 'PayPal not configured' }, 503);
  }

  const body = await c.req.json() as { id: string; event_type: string; resource: Record<string, any> };
  const db = drizzle(c.env.DB);

  // Idempotency check
  const processed = await db
    .select()
    .from(schema.webhookEvents)
    .where(eq(schema.webhookEvents.id, body.id))
    .get();

  if (processed) {
    return c.json({ received: true });
  }

  // Verify webhook with PayPal API
  const baseUrl = c.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${c.env.PAYPAL_CLIENT_ID}:${c.env.PAYPAL_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const auth = await authResponse.json() as { access_token: string };

  if (c.env.PAYPAL_WEBHOOK_ID) {
    const verifyResponse = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook_id: c.env.PAYPAL_WEBHOOK_ID,
        transmission_id: c.req.header('paypal-transmission-id'),
        transmission_time: c.req.header('paypal-transmission-time'),
        cert_url: c.req.header('paypal-cert-url'),
        auth_algo: c.req.header('paypal-auth-algo'),
        transmission_sig: c.req.header('paypal-transmission-sig'),
        webhook_event: body,
      }),
    });

    const verification = await verifyResponse.json() as { verification_status: string };
    if (verification.verification_status !== 'SUCCESS') {
      return c.json({ error: 'Invalid webhook signature' }, 400);
    }
  }

  const resource = body.resource;

  switch (body.event_type) {
    case 'CHECKOUT.ORDER.APPROVED':
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const customId = resource.custom_id || resource.purchase_units?.[0]?.custom_id;
      const productId = resource.purchase_units?.[0]?.reference_id;
      if (customId && productId) {
        await db.insert(schema.orders).values({
          id: generateId(),
          userId: customId,
          productId,
          status: 'completed',
          amount: Math.round(parseFloat(resource.amount?.value || resource.purchase_units?.[0]?.amount?.value || '0') * 100),
          currency: (resource.amount?.currency_code || resource.purchase_units?.[0]?.amount?.currency_code || 'usd').toLowerCase(),
          paymentProvider: 'paypal',
          paymentId: resource.id,
          paymentStatus: 'completed',
          customerEmail: resource.payer?.email_address || '',
          customerName: resource.payer?.name ? `${resource.payer.name.given_name} ${resource.payer.name.surname}` : null,
          createdAt: now(),
        });
      }
      break;
    }

    case 'BILLING.SUBSCRIPTION.ACTIVATED': {
      const customId = resource.custom_id;
      if (customId) {
        const [userId, productId] = customId.split(':');
        await db.insert(schema.subscriptions).values({
          id: generateId(),
          userId,
          productId,
          status: 'active',
          paymentProvider: 'paypal',
          providerSubscriptionId: resource.id,
          providerCustomerId: resource.subscriber?.payer_id,
          createdAt: now(),
        });
      }
      break;
    }

    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED': {
      await db
        .update(schema.subscriptions)
        .set({
          status: body.event_type.includes('CANCELLED') ? 'canceled' : 'expired',
          canceledAt: now(),
          updatedAt: now(),
        })
        .where(and(
          eq(schema.subscriptions.providerSubscriptionId, resource.id),
          eq(schema.subscriptions.paymentProvider, 'paypal')
        ));
      break;
    }

    case 'BILLING.SUBSCRIPTION.SUSPENDED': {
      await db
        .update(schema.subscriptions)
        .set({ status: 'past_due', updatedAt: now() })
        .where(and(
          eq(schema.subscriptions.providerSubscriptionId, resource.id),
          eq(schema.subscriptions.paymentProvider, 'paypal')
        ));
      break;
    }
  }

  await db.insert(schema.webhookEvents).values({
    id: body.id,
    provider: 'paypal',
    type: body.event_type,
    processedAt: now(),
  });

  return c.json({ received: true });
});

export default app;
