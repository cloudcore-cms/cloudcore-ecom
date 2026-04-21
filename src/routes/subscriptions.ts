import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { EcomEnv, EcomVariables } from '../types';
import * as schema from '../schema';
import { now } from '../utils';

const app = new Hono<{ Bindings: EcomEnv; Variables: EcomVariables }>();

// List subscriptions for current user
app.get('/my', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Auth required' }, 401);

  const db = drizzle(c.env.DB);
  const items = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, user.id))
    .orderBy(desc(schema.subscriptions.createdAt));

  return c.json({ items });
});

// List all subscriptions (admin)
app.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const status = c.req.query('status');
  const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') || '50') || 50), 100);
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0') || 0);

  const conditions = [];
  if (status) conditions.push(eq(schema.subscriptions.status, status));

  const items = await db
    .select()
    .from(schema.subscriptions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ items });
});

// Cancel subscription
app.post('/:id/cancel', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Auth required' }, 401);

  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const sub = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, id))
    .get();

  if (!sub) return c.json({ error: 'Subscription not found' }, 404);

  // Users can only cancel their own subs, admins can cancel any
  if (sub.userId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Not authorized' }, 403);
  }

  if (sub.status === 'canceled') {
    return c.json({ error: 'Already canceled' }, 400);
  }

  // Cancel with payment provider
  if (sub.paymentProvider === 'stripe' && sub.providerSubscriptionId && c.env.STRIPE_SECRET_KEY) {
    await fetch(`https://api.stripe.com/v1/subscriptions/${sub.providerSubscriptionId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'cancel_at_period_end=true',
    });

    await db
      .update(schema.subscriptions)
      .set({ cancelAtPeriodEnd: 1, updatedAt: now() })
      .where(eq(schema.subscriptions.id, id));

    return c.json({ success: true, cancelAtPeriodEnd: true });
  }

  if (sub.paymentProvider === 'paypal' && sub.providerSubscriptionId && c.env.PAYPAL_CLIENT_ID) {
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

    await fetch(`${baseUrl}/v1/billing/subscriptions/${sub.providerSubscriptionId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'User requested cancellation' }),
    });
  }

  await db
    .update(schema.subscriptions)
    .set({ status: 'canceled', canceledAt: now(), updatedAt: now() })
    .where(eq(schema.subscriptions.id, id));

  return c.json({ success: true });
});

export default app;
