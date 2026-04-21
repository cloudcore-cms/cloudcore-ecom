// The CMS provides these via its Env bindings
export interface EcomEnv {
  DB: D1Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_WEBHOOK_ID?: string;
  PAYPAL_MODE?: string; // 'sandbox' | 'live'
}

// The CMS sets these variables via its auth middleware
export interface EcomVariables {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    isActive: boolean;
  } | null;
  session: unknown;
}

export type ProductType = 'one_time' | 'subscription';
export type ProductStatus = 'draft' | 'active' | 'archived';
export type OrderStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'expired';
export type PaymentProvider = 'stripe' | 'paypal';
export type IntervalType = 'week' | 'month' | 'year';
