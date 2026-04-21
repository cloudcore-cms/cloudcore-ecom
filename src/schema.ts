import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Products
// ============================================================================

export const products = sqliteTable('cc_ecom_products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  type: text('type').notNull().default('one_time'), // 'one_time' | 'subscription'
  status: text('status').notNull().default('draft'), // 'draft' | 'active' | 'archived'

  // Pricing
  price: integer('price').notNull(), // in cents
  currency: text('currency').notNull().default('usd'),
  compareAtPrice: integer('compare_at_price'), // original price for showing discounts

  // Subscription fields
  intervalType: text('interval_type'), // 'month' | 'year' | 'week'
  intervalCount: integer('interval_count'), // e.g., 1 for monthly, 3 for quarterly
  trialDays: integer('trial_days'),

  // Stripe/PayPal IDs (set after syncing)
  stripeProductId: text('stripe_product_id'),
  stripePriceId: text('stripe_price_id'),
  paypalPlanId: text('paypal_plan_id'),

  // Metadata
  imageUrl: text('image_url'),
  metadata: text('metadata'), // JSON string for custom fields
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
}, (table) => ({
  slugIdx: index('idx_ecom_products_slug').on(table.slug),
  statusIdx: index('idx_ecom_products_status').on(table.status),
  typeIdx: index('idx_ecom_products_type').on(table.type),
}));

// ============================================================================
// Orders (one-time purchases)
// ============================================================================

export const orders = sqliteTable('cc_ecom_orders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  productId: text('product_id').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'completed' | 'failed' | 'refunded'

  // Payment
  amount: integer('amount').notNull(), // in cents
  currency: text('currency').notNull().default('usd'),
  paymentProvider: text('payment_provider'), // 'stripe' | 'paypal'
  paymentId: text('payment_id'), // Stripe PaymentIntent ID or PayPal order ID
  paymentStatus: text('payment_status'), // provider-specific status

  // Customer info (snapshot at time of purchase)
  customerEmail: text('customer_email').notNull(),
  customerName: text('customer_name'),

  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
}, (table) => ({
  userIdx: index('idx_ecom_orders_user').on(table.userId),
  productIdx: index('idx_ecom_orders_product').on(table.productId),
  statusIdx: index('idx_ecom_orders_status').on(table.status),
}));

// ============================================================================
// Subscriptions
// ============================================================================

export const subscriptions = sqliteTable('cc_ecom_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  productId: text('product_id').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'past_due' | 'canceled' | 'trialing' | 'expired'

  // Payment
  paymentProvider: text('payment_provider').notNull(), // 'stripe' | 'paypal'
  providerSubscriptionId: text('provider_subscription_id'), // Stripe sub ID or PayPal sub ID
  providerCustomerId: text('provider_customer_id'), // Stripe customer ID or PayPal payer ID

  // Billing
  currentPeriodStart: text('current_period_start'),
  currentPeriodEnd: text('current_period_end'),
  cancelAtPeriodEnd: integer('cancel_at_period_end').default(0), // boolean
  canceledAt: text('canceled_at'),
  trialEnd: text('trial_end'),

  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
}, (table) => ({
  userIdx: index('idx_ecom_subs_user').on(table.userId),
  productIdx: index('idx_ecom_subs_product').on(table.productId),
  statusIdx: index('idx_ecom_subs_status').on(table.status),
  providerIdx: index('idx_ecom_subs_provider').on(table.paymentProvider, table.providerSubscriptionId),
}));

// ============================================================================
// Webhook Events (idempotency log)
// ============================================================================

export const webhookEvents = sqliteTable('cc_ecom_webhook_events', {
  id: text('id').primaryKey(), // provider event ID
  provider: text('provider').notNull(), // 'stripe' | 'paypal'
  type: text('type').notNull(), // event type
  processedAt: text('processed_at').notNull(),
}, (table) => ({
  providerIdx: index('idx_ecom_webhooks_provider').on(table.provider, table.id),
}));
