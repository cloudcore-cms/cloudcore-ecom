import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, desc, and, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { EcomEnv, EcomVariables } from '../types';
import * as schema from '../schema';
import { createProductSchema, updateProductSchema } from '../validation';
import { generateId, now, slugify } from '../utils';

const app = new Hono<{ Bindings: EcomEnv; Variables: EcomVariables }>();

// List products (admin/editor — all statuses)
app.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const status = c.req.query('status');
  const type = c.req.query('type');
  const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') || '50') || 50), 100);
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0') || 0);

  const conditions = [];
  if (status === 'draft' || status === 'active' || status === 'archived') {
    conditions.push(eq(schema.products.status, status));
  }
  if (type === 'one_time' || type === 'subscription') {
    conditions.push(eq(schema.products.type, type));
  }

  const items = await db
    .select()
    .from(schema.products)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.products.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.products)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .get();

  return c.json({
    items,
    pagination: { total: countResult?.count ?? 0, limit, offset },
  });
});

// Get single product
app.get('/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const product = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, id))
    .get();

  if (!product) {
    return c.json({ error: 'Product not found' }, 404);
  }

  return c.json(product);
});

// Create product
app.post('/', zValidator('json', createProductSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const body = c.req.valid('json');

  const id = generateId();
  const slug = body.slug || slugify(body.name);
  const timestamp = now();

  // Check slug uniqueness
  const existing = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(eq(schema.products.slug, slug))
    .get();

  if (existing) {
    return c.json({ error: 'Product slug already exists' }, 400);
  }

  // Validate subscription fields
  if (body.type === 'subscription' && !body.intervalType) {
    return c.json({ error: 'Subscription products require intervalType' }, 400);
  }

  await db.insert(schema.products).values({
    id,
    name: body.name,
    slug,
    description: body.description || null,
    type: body.type,
    status: 'draft',
    price: body.price,
    currency: body.currency || 'usd',
    compareAtPrice: body.compareAtPrice || null,
    intervalType: body.intervalType || null,
    intervalCount: body.intervalCount || 1,
    trialDays: body.trialDays || null,
    imageUrl: body.imageUrl || null,
    metadata: body.metadata ? JSON.stringify(body.metadata) : null,
    sortOrder: body.sortOrder || 0,
    createdAt: timestamp,
  });

  return c.json({ id, slug }, 201);
});

// Update product
app.patch('/:id', zValidator('json', updateProductSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const existing = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, id))
    .get();

  if (!existing) {
    return c.json({ error: 'Product not found' }, 404);
  }

  if (body.slug) {
    const slugExists = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.slug, body.slug))
      .get();
    if (slugExists && slugExists.id !== id) {
      return c.json({ error: 'Slug already exists' }, 400);
    }
  }

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;
  if (body.price !== undefined) updates.price = body.price;
  if (body.currency !== undefined) updates.currency = body.currency;
  if (body.compareAtPrice !== undefined) updates.compareAtPrice = body.compareAtPrice;
  if (body.intervalType !== undefined) updates.intervalType = body.intervalType;
  if (body.intervalCount !== undefined) updates.intervalCount = body.intervalCount;
  if (body.trialDays !== undefined) updates.trialDays = body.trialDays;
  if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl;
  if (body.metadata !== undefined) updates.metadata = body.metadata ? JSON.stringify(body.metadata) : null;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  await db.update(schema.products).set(updates).where(eq(schema.products.id, id));

  return c.json({ success: true });
});

// Delete product
app.delete('/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const existing = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(eq(schema.products.id, id))
    .get();

  if (!existing) {
    return c.json({ error: 'Product not found' }, 404);
  }

  // Check for active subscriptions
  const activeSubs = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(and(
      eq(schema.subscriptions.productId, id),
      eq(schema.subscriptions.status, 'active')
    ))
    .get();

  if (activeSubs) {
    return c.json({ error: 'Cannot delete product with active subscriptions' }, 400);
  }

  await db.delete(schema.products).where(eq(schema.products.id, id));

  return c.json({ success: true });
});

export default app;
