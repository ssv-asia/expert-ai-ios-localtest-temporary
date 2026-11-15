import { fetchPaymentHistory as fetchGatewayPaymentHistory } from '@/lib/web-payments';

// Native builds use Google Play Billing on Android. Keep cancellation
// platform-specific, while allowing read-only account history on both native
// platforms through the authenticated gateway endpoint.
export async function cancelTierSubscription(): Promise<void> {
  throw new Error('Google Play manages subscription cancellation on Android.');
}

export async function fetchPaymentHistory(token: string): Promise<any[]> {
  return fetchGatewayPaymentHistory(token);
}
