// TypeScript fallback; Metro selects the platform-specific implementation at
// runtime (`.native.ts` for Android, `.web.ts` for the browser).
export { cancelTierSubscription, fetchPaymentHistory } from '@/lib/web-payments';
