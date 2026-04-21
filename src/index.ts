import { Hono } from 'hono';
import type { EcomEnv, EcomVariables } from './types';
import productRoutes from './routes/products';
import checkoutRoutes from './routes/checkout';
import subscriptionRoutes from './routes/subscriptions';
import webhookRoutes from './routes/webhooks';
import publicRoutes from './routes/public';

/**
 * Cloudcore Ecom - E-commerce plugin for Cloudcore CMS
 *
 * Mount into your CMS:
 *   import { ecomRoutes, ecomPublicRoutes, ecomWebhookRoutes } from '@cloudcore-cms/ecom';
 *   app.route('/api/v1/shop', ecomRoutes);           // Admin routes (behind authMiddleware)
 *   app.route('/api/v1/public/shop', ecomPublicRoutes); // Public product listing
 *   app.route('/api/v1/webhooks', ecomWebhookRoutes);   // Payment webhooks (no auth)
 */

// Admin routes — mount behind authMiddleware + editorMiddleware in the CMS
const ecomRoutes = new Hono<{ Bindings: EcomEnv; Variables: EcomVariables }>();
ecomRoutes.route('/products', productRoutes);
ecomRoutes.route('/checkout', checkoutRoutes);
ecomRoutes.route('/subscriptions', subscriptionRoutes);

// Public routes — no auth required, read-only
const ecomPublicRoutes = publicRoutes;

// Webhook routes — no auth (verified by provider signatures)
const ecomWebhookRoutes = webhookRoutes;

// Schema exports for Drizzle
export { products, orders, subscriptions, webhookEvents } from './schema';
export type { EcomEnv, EcomVariables } from './types';
export type { ProductType, ProductStatus, OrderStatus, SubscriptionStatus, PaymentProvider } from './types';

export { ecomRoutes, ecomPublicRoutes, ecomWebhookRoutes };
