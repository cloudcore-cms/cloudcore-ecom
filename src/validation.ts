import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(5000).optional(),
  type: z.enum(['one_time', 'subscription']).default('one_time'),
  price: z.number().int().min(0), // cents
  currency: z.string().length(3).default('usd'),
  compareAtPrice: z.number().int().min(0).optional(),
  intervalType: z.enum(['week', 'month', 'year']).optional(),
  intervalCount: z.number().int().min(1).max(12).optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  imageUrl: z.string().url().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  price: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  compareAtPrice: z.number().int().min(0).optional().nullable(),
  intervalType: z.enum(['week', 'month', 'year']).optional().nullable(),
  intervalCount: z.number().int().min(1).max(12).optional().nullable(),
  trialDays: z.number().int().min(0).max(365).optional().nullable(),
  imageUrl: z.string().url().max(2000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const checkoutSchema = z.object({
  productId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  provider: z.enum(['stripe', 'paypal']).default('stripe'),
});
