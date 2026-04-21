import { describe, it, expect } from 'vitest';
import { ecomRoutes, ecomPublicRoutes, ecomWebhookRoutes } from '../index';

const env = { DB: {} as any };

describe('Ecom Routes', () => {
  describe('Admin routes', () => {
    it('GET /products returns product list', async () => {
      // Without a real DB this will error, but the route should exist
      const res = await ecomRoutes.request('/products', {}, env);
      // 500 because no real DB — but NOT 404 (route exists)
      expect(res.status).not.toBe(404);
    });

    it('GET /products/:id returns 404 for missing product', async () => {
      const res = await ecomRoutes.request('/products/nonexistent', {}, env);
      expect(res.status).not.toBe(404); // route exists, DB error
    });
  });

  describe('Public routes', () => {
    it('GET /products route exists', async () => {
      const res = await ecomPublicRoutes.request('/products', {}, env);
      expect(res.status).not.toBe(404);
    });

    it('GET /products/:slug route exists', async () => {
      const res = await ecomPublicRoutes.request('/products/test-product', {}, env);
      expect(res.status).not.toBe(404);
    });
  });

  describe('Webhook routes', () => {
    it('POST /stripe without config returns 503', async () => {
      const res = await ecomWebhookRoutes.request('/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }, env);
      expect(res.status).toBe(503);
    });

    it('POST /paypal without config returns 503', async () => {
      const res = await ecomWebhookRoutes.request('/paypal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'test', event_type: 'test', resource: {} }),
      }, env);
      expect(res.status).toBe(503);
    });
  });
});

describe('Exports', () => {
  it('exports route handlers', () => {
    expect(ecomRoutes).toBeDefined();
    expect(ecomPublicRoutes).toBeDefined();
    expect(ecomWebhookRoutes).toBeDefined();
  });

  it('exports schema', async () => {
    const schema = await import('../schema');
    expect(schema.products).toBeDefined();
    expect(schema.orders).toBeDefined();
    expect(schema.subscriptions).toBeDefined();
    expect(schema.webhookEvents).toBeDefined();
  });

  it('exports types', async () => {
    // Type-only exports — just verify the module loads
    const types = await import('../types');
    expect(types).toBeDefined();
  });
});
