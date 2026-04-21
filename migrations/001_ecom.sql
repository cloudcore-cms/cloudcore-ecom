-- Cloudcore Ecom Schema
-- Run against the same D1 database as the CMS

-- Products
CREATE TABLE IF NOT EXISTS cc_ecom_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'one_time',
  status TEXT NOT NULL DEFAULT 'draft',
  price INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  compare_at_price INTEGER,
  interval_type TEXT,
  interval_count INTEGER,
  trial_days INTEGER,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  paypal_plan_id TEXT,
  image_url TEXT,
  metadata TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ecom_products_slug ON cc_ecom_products(slug);
CREATE INDEX IF NOT EXISTS idx_ecom_products_status ON cc_ecom_products(status);
CREATE INDEX IF NOT EXISTS idx_ecom_products_type ON cc_ecom_products(type);

-- Orders (one-time purchases)
CREATE TABLE IF NOT EXISTS cc_ecom_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  payment_provider TEXT,
  payment_id TEXT,
  payment_status TEXT,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES cc_users(id),
  FOREIGN KEY (product_id) REFERENCES cc_ecom_products(id)
);

CREATE INDEX IF NOT EXISTS idx_ecom_orders_user ON cc_ecom_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_product ON cc_ecom_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_status ON cc_ecom_orders(status);

-- Subscriptions
CREATE TABLE IF NOT EXISTS cc_ecom_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  payment_provider TEXT NOT NULL,
  provider_subscription_id TEXT,
  provider_customer_id TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER DEFAULT 0,
  canceled_at TEXT,
  trial_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES cc_users(id),
  FOREIGN KEY (product_id) REFERENCES cc_ecom_products(id)
);

CREATE INDEX IF NOT EXISTS idx_ecom_subs_user ON cc_ecom_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_ecom_subs_product ON cc_ecom_subscriptions(product_id);
CREATE INDEX IF NOT EXISTS idx_ecom_subs_status ON cc_ecom_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_ecom_subs_provider ON cc_ecom_subscriptions(payment_provider, provider_subscription_id);

-- Webhook Events (idempotency)
CREATE TABLE IF NOT EXISTS cc_ecom_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ecom_webhooks_provider ON cc_ecom_webhook_events(provider, id);
