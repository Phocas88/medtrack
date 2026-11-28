import Stripe from 'stripe';
import type { SuiteProductId } from '@/lib/product-suite';
import { HttpError } from '@/lib/server-auth';

export const planKeys = ['starter', 'professional', 'enterprise'] as const;
export type PlanKey = typeof planKeys[number];

export function priceForPlan(plan: PlanKey): string {
  const price = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  if (!price || !/^price_[a-zA-Z0-9]+$/.test(price)) throw new HttpError(503, 'This plan is not available yet. Please contact support.');
  return price;
}

export function planForPrice(price: string): PlanKey | null {
  return planKeys.find(plan => process.env[`STRIPE_PRICE_${plan.toUpperCase()}`] === price) || null;
}

export function stripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Payments are not configured');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function addOnPriceId(product: SuiteProductId): string | undefined {
  const price = process.env[`STRIPE_PRICE_ADDON_${product.toUpperCase()}`];
  return price && /^price_[a-zA-Z0-9]+$/.test(price) ? price : undefined;
}

export function priceForAddOn(product: SuiteProductId): string {
  const price = addOnPriceId(product);
  if (!price) throw new HttpError(503, 'This add-on is not available for purchase yet.');
  return price;
}
