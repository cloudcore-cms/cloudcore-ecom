import { Hono } from 'hono';
import { eq, desc, and, asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { EcomEnv, EcomVariables } from '../types';
import * as schema from '../schema';

const app = new Hono<{ Bindings: EcomEnv; Variables: EcomVariables }>();

// List active products (public)
app.get('/products', async (c) => {
  const db = drizzle(c.env.DB);
  const type = c.req.query('type');

  const conditions = [eq(schema.products.status, 'active')];
  if (type === 'one_time' || type === 'subscription') {
    conditions.push(eq(schema.products.type, type));
  }

  const items = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      slug: schema.products.slug,
      description: schema.products.description,
      type: schema.products.type,
      price: schema.products.price,
      currency: schema.products.currency,
      compareAtPrice: schema.products.compareAtPrice,
      intervalType: schema.products.intervalType,
      intervalCount: schema.products.intervalCount,
      trialDays: schema.products.trialDays,
      imageUrl: schema.products.imageUrl,
    })
    .from(schema.products)
    .where(and(...conditions))
    .orderBy(asc(schema.products.sortOrder), desc(schema.products.createdAt));

  return c.json({ items });
});

// Get single active product by slug (public)
app.get('/products/:slug', async (c) => {
  const db = drizzle(c.env.DB);
  const slug = c.req.param('slug');

  const product = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      slug: schema.products.slug,
      description: schema.products.description,
      type: schema.products.type,
      price: schema.products.price,
      currency: schema.products.currency,
      compareAtPrice: schema.products.compareAtPrice,
      intervalType: schema.products.intervalType,
      intervalCount: schema.products.intervalCount,
      trialDays: schema.products.trialDays,
      imageUrl: schema.products.imageUrl,
    })
    .from(schema.products)
    .where(and(
      eq(schema.products.slug, slug),
      eq(schema.products.status, 'active')
    ))
    .get();

  if (!product) {
    return c.json({ error: 'Product not found' }, 404);
  }

  return c.json(product);
});

export default app;
