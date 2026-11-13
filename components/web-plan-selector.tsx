import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@/lib/auth';
import { fetchAccountInfo, fetchBalance } from '@/lib/gateway-client';
import { requestTierPaymentLink, requestTierSubscription } from '@/lib/web-payments';
import { planFeatureLines, TIER_STORE_PLANS } from '@/lib/plan-catalog';
import { Fonts } from '@/constants/theme';

const OWL_BASE = 'https://ssv.asia/content/images/2026/09/';
const OWLS: Record<number, string> = { 11: '00-starter-256-3.webp', 12: '02-professional-256-3.webp', 13: '04-expert-256-3.webp', 14: '10-foundational-enterprise-256-4.webp' };
export function WebPlanSelector({ session, colors, onRefresh }: { session: Session | null; colors: any; onRefresh: () => Promise<void> }) {
  const [tier, setTier] = useState(12);
  const [kind, setKind] = useState<'weekly' | 'monthly'>('monthly');
  const [busy, setBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const plan = TIER_STORE_PLANS[tier];
  const price = kind === 'weekly' ? plan.weekly : plan.price;
  if (Platform.OS !== 'web') return null;
  const begin = async (autopay: boolean) => {
    if (!session?.token) { Alert.alert('Sign in required', 'Sign in before choosing a plan.'); return; }
    setBusy(true);
    setPaymentMessage(null);
    try {
      const [before, beforeBalance] = await Promise.all([
        fetchAccountInfo(session.token).catch(() => null),
        fetchBalance(session.token).catch(() => null),
      ]);
      const result = autopay ? await requestTierSubscription(session.token, tier, kind) : await requestTierPaymentLink(session.token, tier, kind);
      let checkoutWindow: Window | null = null;
      if (result?.url) {
        checkoutWindow = typeof window !== 'undefined' && window.open ? window.open(result.url, '_blank', 'noopener,noreferrer') : null;
        if (!checkoutWindow) await Linking.openURL(result.url);
      }
      setPaymentMessage(autopay ? 'Checkout opened. Waiting for Razorpay to confirm the mandate…' : 'Checkout opened. Waiting for Razorpay to confirm your payment…');
      // The gateway webhook is authoritative. Keep this app open and reconcile the live
      // account state while Razorpay delivers that webhook, so the user does not need to
      // guess whether the purchase was applied.
      let confirmed = false;
      let checkoutClosed = false;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (checkoutWindow?.closed) {
          checkoutClosed = true;
          setPaymentMessage('Checkout was closed before confirmation. If you completed payment, use Check subscription status or Restore purchases below.');
          break;
        }
        const [nextAccount, nextBalance] = await Promise.all([
          fetchAccountInfo(session.token).catch(() => null),
          fetchBalance(session.token).catch(() => null),
        ]);
        const beforeKey = before ? JSON.stringify([before.planLabel, before.expires, before.subscription?.status, before.expert_ai?.used, before.expert_ai?.total]) : '';
        const afterKey = nextAccount ? JSON.stringify([nextAccount.planLabel, nextAccount.expires, nextAccount.subscription?.status, nextAccount.expert_ai?.used, nextAccount.expert_ai?.total]) : '';
        const beforeBalanceKey = beforeBalance ? JSON.stringify([beforeBalance.tierLabel, beforeBalance.sessionExpires, beforeBalance.passActive, beforeBalance.secondsLeft]) : '';
        const afterBalanceKey = nextBalance ? JSON.stringify([nextBalance.tierLabel, nextBalance.sessionExpires, nextBalance.passActive, nextBalance.secondsLeft]) : '';
        confirmed = (!!nextAccount && beforeKey !== afterKey) || beforeBalanceKey !== afterBalanceKey;
        await onRefresh();
        if (confirmed) break;
      }
      if (!checkoutClosed) setPaymentMessage(confirmed ? 'Payment confirmed. Your plan and balance are now updated.' : 'Payment is not confirmed yet. If Razorpay shows success, use Check subscription status or Restore purchases in Account Settings in a moment.');
    } catch (error) { Alert.alert('Payment could not start', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  return <View style={[styles.section, { borderTopColor: colors.border }]}>
    <Text style={[styles.heading, { color: colors.text }]}>Choose a plan</Text>
    <Text style={[styles.note, { color: colors.textSecondary }]}>Weekly is exactly one-third of the monthly price and quota.</Text>
    <View style={styles.toggle}><Pressable onPress={() => setKind('weekly')} style={[styles.toggleButton, { borderColor: colors.border }, kind === 'weekly' && { backgroundColor: colors.buttonBackground, borderColor: colors.accent }]}><Text style={{ color: colors.text, fontFamily: Fonts.sansSemiBold, fontSize: 12 }}>Weekly</Text></Pressable><Pressable onPress={() => setKind('monthly')} style={[styles.toggleButton, { borderColor: colors.border }, kind === 'monthly' && { backgroundColor: colors.buttonBackground, borderColor: colors.accent }]}><Text style={{ color: colors.text, fontFamily: Fonts.sansSemiBold, fontSize: 12 }}>Monthly · 3× tokens</Text></Pressable></View>
    <View style={styles.cards}>{Object.entries(TIER_STORE_PLANS).map(([key, item]) => { const selected = Number(key) === tier; return <Pressable key={key} onPress={() => setTier(Number(key))} style={[styles.card, { backgroundColor: colors.buttonBackground, borderColor: selected ? colors.accent : colors.border }]}><Image source={{ uri: OWL_BASE + OWLS[Number(key)] }} style={styles.owl} resizeMode="contain" /><Text style={[styles.planName, { color: colors.text }]}>{item.label}</Text><Text style={[styles.price, { color: colors.text }]}>₹{kind === 'weekly' ? item.weekly : item.price}</Text><Text style={[styles.per, { color: colors.textTertiary }]}>{kind === 'weekly' ? 'per week' : 'per month'}</Text></Pressable>; })}</View>
    <View style={[styles.planDetails, { backgroundColor: colors.buttonBackground, borderColor: colors.border }]}>
      <Text style={[styles.detailTitle, { color: colors.text }]}>{plan.label} includes</Text>
      <Text style={[styles.planMessage, { color: colors.textSecondary }]}>{plan.message}</Text>
      {planFeatureLines(plan, kind).map((line) => <Text key={line} style={[styles.benefit, { color: colors.textSecondary }]}>✓  {line}</Text>)}
      <Text style={[styles.renewal, { color: colors.textTertiary }]}>{kind === 'monthly' ? 'Billed monthly. Auto-renew can be cancelled through your subscription settings.' : 'Billed weekly. Auto-renew can be cancelled through your subscription settings.'}</Text>
    </View>
    <Pressable disabled={busy} onPress={() => begin(true)} style={[styles.action, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}>{busy ? <ActivityIndicator color={colors.onTint} /> : <Text style={{ color: colors.onTint, fontFamily: Fonts.sansSemiBold, fontSize: 13 }}>Subscribe & auto-renew · ₹{price}</Text>}</Pressable>
    <Pressable disabled={busy} onPress={() => begin(false)} style={[styles.actionOutline, { borderColor: colors.accent, opacity: busy ? 0.6 : 1 }]}><Text style={{ color: colors.text, fontFamily: Fonts.sansSemiBold, fontSize: 13 }}>Buy once instead · ₹{price}</Text></Pressable>
    {paymentMessage ? <View style={styles.paymentStatus}><ActivityIndicator size="small" color={colors.accent} /><Text style={[styles.paymentMessage, { color: colors.textSecondary }]}>{paymentMessage}</Text></View> : null}
  </View>;
}
const styles = StyleSheet.create({ section: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 18, paddingTop: 16 }, heading: { fontFamily: Fonts.sansSemiBold, fontSize: 16 }, note: { fontFamily: Fonts.sans, fontSize: 12, marginTop: 4 }, toggle: { flexDirection: 'row', gap: 8, marginTop: 12 }, toggleButton: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingVertical: 9 }, cards: { flexDirection: 'row', gap: 6, marginTop: 12 }, card: { flex: 1, minWidth: 0, alignItems: 'center', borderWidth: 1, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 3 }, owl: { width: 45, height: 45 }, planName: { fontFamily: Fonts.sansSemiBold, fontSize: 11 }, price: { fontFamily: Fonts.sansBold, fontSize: 15, marginTop: 3 }, per: { fontFamily: Fonts.sans, fontSize: 9 }, planDetails: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12, gap: 5 }, detailTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14, marginBottom: 2 }, planMessage: { fontFamily: Fonts.sansSemiBold, fontSize: 12, lineHeight: 17 }, benefit: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17 }, renewal: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, marginTop: 4 }, action: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginTop: 10 }, actionOutline: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, marginTop: 7 }, paymentStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingHorizontal: 8 }, paymentMessage: { flex: 1, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17, textAlign: 'center' } });
