import { APPLE_SUBSCRIPTION_IDS, TIER_STORE_PLANS, type PlanBillingPeriod } from './plan-catalog';

export function applePlanForProduct(productId: string): { tierIdx: number; period: PlanBillingPeriod } | null {
  for (const [tier, products] of Object.entries(APPLE_SUBSCRIPTION_IDS)) {
    if (products.weekly === productId) return { tierIdx: Number(tier), period: 'weekly' };
    if (products.monthly === productId) return { tierIdx: Number(tier), period: 'monthly' };
  }
  return null;
}

export function applePlanLabel(tierIdx: number): string {
  return TIER_STORE_PLANS[tierIdx]?.label ?? 'Expert AI';
}
