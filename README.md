# Cloudcore Ecom

![CI](https://github.com/cloudcore-cms/cloudcore-ecom/actions/workflows/ci.yml/badge.svg)

E-commerce starter for [Cloudcore CMS](https://github.com/cloudcore-cms/cloudcore-cms). Adds products, subscriptions, Stripe, and PayPal to your CMS.

Not a standalone service — copy the source files into your CMS. One Worker, one database, one auth system.

## Setup

### 1. Copy ecom files into your CMS

```bash
# Clone this repo
git clone https://github.com/cloudcore-cms/cloudcore-ecom.git

# Copy the source files into your CMS
cp -r cloudcore-ecom/src/* your-cms/src/ecom/

# Copy the migration
cp cloudcore-ecom/migrations/001_ecom.sql your-cms/src/db/migrations/002_ecom.sql
```

### 2. Run the migration

```bash
npx wrangler d1 migrations apply cloudcore-db --file=src/db/migrations/002_ecom.sql
```

### 3. Mount the routes in your CMS

```typescript
// src/index.ts
import { ecomRoutes, ecomPublicRoutes, ecomWebhookRoutes } from './ecom';

// Admin routes (behind auth)
app.route('/api/v1/shop', ecomRoutes);

// Public product listing (no auth)
app.route('/api/v1/public/shop', ecomPublicRoutes);

// Payment webhooks (verified by provider signatures, no auth)
app.route('/api/v1/webhooks', ecomWebhookRoutes);
```

### 4. Add environment variables

```toml
# wrangler.toml [vars] or use wrangler secret put
STRIPE_SECRET_KEY = ""
STRIPE_WEBHOOK_SECRET = ""

# PayPal (optional)
PAYPAL_CLIENT_ID = ""
PAYPAL_CLIENT_SECRET = ""
PAYPAL_WEBHOOK_ID = ""
PAYPAL_MODE = "sandbox"  # or "live"
```

## API Endpoints

### Admin (requires CMS auth)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/shop/products` | List products |
| `GET` | `/shop/products/:id` | Get product |
| `POST` | `/shop/products` | Create product |
| `PATCH` | `/shop/products/:id` | Update product |
| `DELETE` | `/shop/products/:id` | Delete product |
| `POST` | `/shop/checkout` | Create checkout session |
| `GET` | `/shop/subscriptions` | List all subscriptions |
| `GET` | `/shop/subscriptions/my` | List current user's subscriptions |
| `POST` | `/shop/subscriptions/:id/cancel` | Cancel subscription |

### Public (no auth)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/public/shop/products` | List active products |
| `GET` | `/public/shop/products/:slug` | Get product by slug |

### Webhooks (verified by provider)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/webhooks/stripe` | Stripe webhook |
| `POST` | `/webhooks/paypal` | PayPal webhook |

## Product Types

**One-time purchase:**
```json
{
  "name": "Pro Template",
  "type": "one_time",
  "price": 4900,
  "currency": "usd"
}
```

**Subscription:**
```json
{
  "name": "Pro Plan",
  "type": "subscription",
  "price": 1900,
  "currency": "usd",
  "intervalType": "month",
  "intervalCount": 1,
  "trialDays": 14
}
```

Prices are in cents (4900 = $49.00).

## Database Tables

All tables prefixed with `cc_ecom_` to avoid conflicts with CMS tables:

- `cc_ecom_products` — products and subscription plans
- `cc_ecom_orders` — one-time purchase records
- `cc_ecom_subscriptions` — active/canceled subscriptions
- `cc_ecom_webhook_events` — idempotency log for payment webhooks

## How It Works

1. Admin creates products in the CMS (or via API)
2. Frontend lists active products via the public endpoint
3. User clicks "Buy" — frontend calls `/shop/checkout` with product ID and payment provider
4. User is redirected to Stripe/PayPal hosted checkout
5. On success, webhook creates order/subscription records in D1
6. Frontend checks subscription status via `/shop/subscriptions/my`

No PCI compliance needed — all card handling is done by Stripe/PayPal.

## License

MIT
