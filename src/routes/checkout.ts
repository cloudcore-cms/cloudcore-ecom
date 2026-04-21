import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { EcomEnv, EcomVariables } from '../types';
import * as schema from '../schema';
import { checkoutSchema } from '../validation';
import { generateId, now } from '../utils';

const app = new Hono<{ Bindings: EcomEnv; Variables: EcomVariables }>();

// Create checkout session
app.post('/', zValidator('json', checkoutSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get('user');
  const body = c.req.valid('json');

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Get product
  const product = await db
    .select()
    .from(schema.products)
    .where(and(
      eq(schema.products.id, body.productId),
      eq(schema.products.status, 'active')
    ))
    .get();

  if (!product) {
    return c.json({ error: 'Product not found or not active' }, 404);
  }

  if (body.provider === 'stripe') {
    return await createStripeCheckout(c, product, user, body);
  } else if (body.provider === 'paypal') {
    return await createPayPalCheckout(c, product, user, body);
  }

  return c.json({ error: 'Invalid payment provider' }, 400);
});

// Stripe checkout
async function createStripeCheckout(
  c: any,
  product: typeof schema.products.$inferSelect,
  user: EcomVariables['user'],
  body: { successUrl: string; cancelUrl: string }
) {
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: 'Stripe not configured' }, 503);
  }

  const isSubscription = product.type === 'subscription';
  const params = new URLSearchParams();
  params.set('mode', isSubscription ? 'subscription' : 'payment');
  params.set('success_url', body.successUrl);
  params.set('cancel_url', body.cancelUrl);
  params.set('customer_email', user!.email);
  params.set('client_reference_id', user!.id);
  params.set('metadata[product_id]', product.id);
  params.set('metadata[user_id]', user!.id);

  if (product.stripePriceId) {
    params.set('line_items[0][price]', product.stripePriceId);
    params.set('line_items[0][quantity]', '1');
  } else {
    params.set('line_items[0][price_data][currency]', product.currency);
    params.set('line_items[0][price_data][product_data][name]', product.name);
    params.set('line_items[0][price_data][unit_amount]', String(product.price));
    if (isSubscription && product.intervalType) {
      params.set('line_items[0][price_data][recurring][interval]', product.intervalType);
      params.set('line_items[0][price_data][recurring][interval_count]', String(product.intervalCount || 1));
    }
    params.set('line_items[0][quantity]', '1');
  }

  if (isSubscription && product.trialDays) {
    params.set('subscription_data[trial_period_days]', String(product.trialDays));
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const session = await response.json() as { id: string; url: string; error?: { message: string } };

  if (session.error) {
    console.error('Stripe checkout error:', session.error);
    return c.json({ error: 'Payment provider error' }, 500);
  }

  return c.json({ url: session.url, sessionId: session.id });
}

// PayPal checkout
async function createPayPalCheckout(
  c: any,
  product: typeof schema.products.$inferSelect,
  user: EcomVariables['user'],
  body: { successUrl: string; cancelUrl: string }
) {
  if (!c.env.PAYPAL_CLIENT_ID || !c.env.PAYPAL_CLIENT_SECRET) {
    return c.json({ error: 'PayPal not configured' }, 503);
  }

  const isSubscription = product.type === 'subscription';
  const baseUrl = c.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  // Get access token
  const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${c.env.PAYPAL_CLIENT_ID}:${c.env.PAYPAL_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const auth = await authResponse.json() as { access_token: string };

  if (isSubscription && product.paypalPlanId) {
    // Create subscription
    const subResponse = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id: product.paypalPlanId,
        custom_id: `${user!.id}:${product.id}`,
        application_context: {
          return_url: body.successUrl,
          cancel_url: body.cancelUrl,
          user_action: 'SUBSCRIBE_NOW',
        },
      }),
    });

    const sub = await subResponse.json() as { id: string; links: { rel: string; href: string }[] };
    const approveLink = sub.links?.find((l) => l.rel === 'approve');

    return c.json({ url: approveLink?.href, subscriptionId: sub.id });
  } else {
    // Create order (one-time)
    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: product.id,
          custom_id: user!.id,
          amount: {
            currency_code: product.currency.toUpperCase(),
            value: (product.price / 100).toFixed(2),
          },
          description: product.name,
        }],
        application_context: {
          return_url: body.successUrl,
          cancel_url: body.cancelUrl,
        },
      }),
    });

    const order = await orderResponse.json() as { id: string; links: { rel: string; href: string }[] };
    const approveLink = order.links?.find((l) => l.rel === 'approve');

    return c.json({ url: approveLink?.href, orderId: order.id });
  }
}

export default app;
