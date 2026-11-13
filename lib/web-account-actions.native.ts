// Native builds use Google Play Billing. These web-only actions intentionally
// resolve to safe no-ops so hosted web checkout/history code is not bundled.
export async function cancelTierSubscription(): Promise<void> {
  throw new Error('Google Play manages subscription cancellation on Android.');
}

export async function fetchPaymentHistory(): Promise<any[]> {
  return [];
}
