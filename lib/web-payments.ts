import { resilientFetch } from '@/lib/gateway-client';
import { TIER_STORE_PLANS } from '@/lib/plan-catalog';

export interface TierPaymentResult { ok: boolean; url?: string; tier?: string; kind?: string; amount?: number; }

export async function requestTierPaymentLink(token: string, tier: number, kind: 'weekly' | 'monthly'): Promise<TierPaymentResult> {
  const plan = TIER_STORE_PLANS[tier];
  const response = await resilientFetch('/pay/link', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ tier, amount: kind === 'weekly' ? plan?.weekly : plan?.price, kind }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error?.message || data?.error || `Could not start payment (${response.status})`);
  return data;
}

export async function requestTierSubscription(token: string, tier: number, kind: 'weekly' | 'monthly'): Promise<any> {
  const response = await resilientFetch('/pay/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ tier, kind }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error?.message || data?.error || `Could not start subscription (${response.status})`);
  return data;
}

export async function cancelTierSubscription(token: string): Promise<void> {
  const response = await resilientFetch('/pay/subscription/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error?.message || data?.error || 'Could not cancel subscription.');
}

export async function fetchPaymentHistory(token: string): Promise<any[]> {
  const response = await resilientFetch('/pay/history', { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.error || 'Could not load payment history.');
  return Array.isArray(data?.payments) ? data.payments : [];
}
