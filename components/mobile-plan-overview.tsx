import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { Fonts } from '@/constants/theme';
import type { Session } from '@/lib/auth';
import { planFeatureLines, TIER_PRODUCT_IDS, TIER_STORE_PLANS } from '@/lib/plan-catalog';
import { acknowledgePlayPurchase, launchPlaySubscription, queryPlayProducts, queryPlayPurchases, subscribeToPlayPurchases, type PlayProduct } from '@/lib/play-billing';
import { verifyGooglePlaySubscription } from '@/lib/gateway-client';

const planColors: Record<number, string> = {
  11: '#9EDBC9',
  12: '#A9C7FF',
  13: '#C7B7FF',
  14: '#F4C98A',
};
// Keep the Android account sheet visually aligned with the web account page.
// These are the same 512px owl tier assets used by the web plan selector.
const OWL_BASE = 'https://ssv.asia/content/images/2026/09/';
const OWLS: Record<number, string> = {
  11: '00-starter-256-3.webp',
  12: '02-professional-256-3.webp',
  13: '04-expert-256-3.webp',
  14: '10-foundational-enterprise-256-4.webp',
};


/** Native account-sheet plan section. It follows the approved web account
 * console's copy and hierarchy; the purchase action is Google Play Billing. */
export function MobilePlanOverview({ colors, session, onRefresh, onRestore }: { colors: any; session: Session | null; onRefresh: () => Promise<void>; onRestore?: () => Promise<void> }) {
  const [selected, setSelected] = useState(12);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [offerChoice, setOfferChoice] = useState<'trial' | 'standard'>('trial');
  const [products, setProducts] = useState<PlayProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const plan = TIER_STORE_PLANS[selected];
  useEffect(() => {
    let mounted = true;
    const productIds = Object.values(TIER_PRODUCT_IDS);
    setProductsLoading(true);
    queryPlayProducts(productIds)
      .then((items) => { if (mounted) setProducts(items); })
      .catch((error) => { if (mounted) setStatus(error instanceof Error ? error.message : 'Google Play plans could not be loaded.'); })
      .finally(() => { if (mounted) setProductsLoading(false); });
    // Use a warmed cache for the first paint, then refresh eligibility/prices
    // in the background while the sheet stays interactive.
    queryPlayProducts(productIds, { forceRefresh: true })
      .then((items) => { if (mounted) setProducts(items); })
      .catch((error) => { if (mounted) setStatus(error instanceof Error ? error.message : 'Google Play plans could not be loaded.'); });
    queryPlayPurchases().catch(() => []);
    const subscription = subscribeToPlayPurchases(async (event) => {
      if (!event.purchases?.length || event.responseCode !== 0) return;
      setBusy(true);
      try {
        if (!session) throw new Error('Sign in before completing a subscription.');
        for (const purchase of event.purchases) {
          if (purchase.purchaseState !== 1) {
            setStatus('Google Play is waiting for payment confirmation. Access will update after payment completes.');
            continue;
          }
          const productId = purchase.productIds[0];
          await verifyGooglePlaySubscription(session.token, { productId, purchaseToken: purchase.purchaseToken, orderId: purchase.orderId });
          if (!purchase.acknowledged) await acknowledgePlayPurchase(purchase.purchaseToken);
        }
        await onRefresh();
        setStatus('Subscription verified and access updated.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Purchase verification is still pending.');
      } finally { setBusy(false); }
    });
    return () => { mounted = false; subscription.remove(); };
  }, [onRefresh, session]);

  const productId = TIER_PRODUCT_IDS[selected];
  const product = products.find((item) => item.productId === productId);
  const matchingOffers = product?.offers.filter((item) => item.basePlanId === billingPeriod) ?? [];
  const trialOffer = selected === 12 && billingPeriod === 'monthly'
    ? matchingOffers.find((item) => item.trialDays === 3)
    : undefined;
  const standardOffer = matchingOffers.find((item) => item.trialDays !== 3) ?? (trialOffer ? undefined : matchingOffers[0]);
  const offer = offerChoice === 'trial' && trialOffer ? trialOffer : standardOffer;
  const trialSelected = offer === trialOffer && !!trialOffer;
  const reloadProducts = async () => {
    setProductsLoading(true);
    setStatus(null);
    try { setProducts(await queryPlayProducts(Object.values(TIER_PRODUCT_IDS), { forceRefresh: true })); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Google Play plans could not be loaded.'); }
    finally { setProductsLoading(false); }
  };
  const startPurchase = async () => {
    if (!session) { Alert.alert('Sign in required', 'Sign in before choosing a plan.'); return; }
    const wantsTrial = offerChoice === 'trial' && !!trialOffer;
    setBusy(true); setStatus(null);
    try {
      // Play ProductDetails can become stale between opening the sheet and checkout.
      // Refresh immediately before launching and use the newly returned eligible token.
      const freshProducts = await queryPlayProducts([productId], { forceRefresh: true });
      setProducts((current) => [...current.filter((item) => item.productId !== productId), ...freshProducts]);
      const freshProduct = freshProducts.find((item) => item.productId === productId);
      const freshOffers = freshProduct?.offers.filter((item) => item.basePlanId === billingPeriod) ?? [];
      const freshTrial = selected === 12 && billingPeriod === 'monthly'
        ? freshOffers.find((item) => item.trialDays === 3)
        : undefined;
      const freshStandard = freshOffers.find((item) => item.trialDays !== 3) ?? (freshTrial ? undefined : freshOffers[0]);
      const freshOffer = wantsTrial ? freshTrial : freshStandard;
      if (!freshProduct || !freshOffer) {
        setStatus(wantsTrial
          ? 'Google Play no longer returns the 3-day trial for this account. Select “Start paid plan now” or reload the offer details.'
          : 'Google Play returned no eligible offer for this plan. Reload the details; if it persists, the Play product or regional availability needs review.');
        return;
      }
      await launchPlaySubscription(productId, freshOffer.offerToken);
    }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not open Google Play checkout.'); }
    finally { setBusy(false); }
  };
  return (
    <View style={styles.section}>
      <View style={styles.toggle}>
        {(['weekly', 'monthly'] as const).map((period) => <Pressable key={period} onPress={() => setBillingPeriod(period)} style={[styles.toggleButton, { borderColor: colors.border }, billingPeriod === period && { borderColor: colors.accent, backgroundColor: colors.buttonBackground }]}><Text style={{ color: colors.text, fontFamily: Fonts.sansSemiBold, fontSize: 12 }}>{period === 'monthly' ? 'Monthly · 3× tokens' : 'Weekly'}</Text></Pressable>)}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
        {Object.entries(TIER_STORE_PLANS).map(([key, item]) => {
          const tier = Number(key);
          const active = tier === selected;
          const tint = planColors[tier] ?? colors.accent;
          return (
            <Pressable key={key} onPress={() => setSelected(tier)} style={[styles.card, { backgroundColor: colors.buttonBackground, borderColor: active ? tint : colors.border }]}>
              <View style={[styles.icon, { backgroundColor: `${tint}33` }]}><Image source={{ uri: OWL_BASE + OWLS[tier] }} style={styles.owl} resizeMode="contain" /></View>
              <Text style={[styles.name, { color: colors.text }]}>{item.label}</Text>
              <Text style={[styles.price, { color: colors.text }]}>{tier === selected && offer?.formattedPrice ? offer.formattedPrice : `₹${billingPeriod === 'monthly' ? item.price : item.weekly}`}</Text>
              <Text style={[styles.per, { color: colors.textTertiary }]}>per {billingPeriod === 'monthly' ? 'month' : 'week'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.details, { backgroundColor: colors.buttonBackground }]}>
        <View style={styles.detailHeader}>
          <Text style={[styles.detailTitle, { color: colors.text }]}>{plan.label}</Text>
          <Text style={[styles.badge, { color: planColors[selected] ?? colors.accent }]}>SELECTED</Text>
        </View>
        <Text style={[styles.detailText, { color: colors.textSecondary }]}>{billingPeriod === 'monthly' ? 'Monthly' : 'Weekly'} · {offer?.formattedPrice ?? `₹${billingPeriod === 'monthly' ? plan.price : plan.weekly}`} per {billingPeriod === 'monthly' ? 'month' : 'week'}</Text>
        <Text style={[styles.planMessage, { color: colors.textSecondary }]}>{plan.message}</Text>
        <View style={styles.benefits}>
          {planFeatureLines(plan, billingPeriod).map((line) => <Text key={line} style={[styles.benefit, { color: colors.textSecondary }]}>✓  {line}</Text>)}
        </View>
      </View>
      {trialOffer ? (
        <View style={styles.offerChoices}>
          {(standardOffer ? (['trial', 'standard'] as const) : (['trial'] as const)).map((choice) => (
            <Pressable key={choice} onPress={() => setOfferChoice(choice)} style={[styles.offerChoice, { borderColor: (choice === 'trial' ? trialSelected : !trialSelected) ? colors.accent : colors.border, backgroundColor: (choice === 'trial' ? trialSelected : !trialSelected) ? colors.buttonBackground : 'transparent' }]}>
              <Text style={{ color: colors.text, fontFamily: Fonts.sansSemiBold, fontSize: 12 }}>{choice === 'trial' ? '3 days free' : 'Start paid plan now'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {trialSelected ? <Text style={[styles.trialTerms, { color: colors.textTertiary }]}>No charge for 3 days, then {offer?.formattedPrice ?? `₹${plan.price}`} per month. Auto-renews until cancelled. Google Play confirms eligibility and payment terms.</Text> : null}
      {!offer && !productsLoading ? <Text style={[styles.trialTerms, { color: colors.textTertiary }]}>Google Play has not returned an eligible offer for this selection. Reload plan details to retry.</Text> : null}
      <Pressable disabled={busy || productsLoading || !offer} onPress={startPurchase} style={[styles.purchase, { backgroundColor: colors.accent, opacity: busy || productsLoading || !offer ? 0.55 : 1 }]}>{busy || productsLoading ? <ActivityIndicator color={colors.onTint} /> : <Text style={{ color: colors.onTint, fontFamily: Fonts.sansSemiBold, fontSize: 13 }}>{trialSelected ? `Start 3-day trial · then ${offer?.formattedPrice ?? `₹${plan.price}`}/month` : offer ? `Subscribe & auto-renew · ${offer.formattedPrice ?? `₹${billingPeriod === 'monthly' ? plan.price : plan.weekly}`}` : 'Reload offer details'}</Text>}</Pressable>
      {!productsLoading ? <Pressable disabled={busy} onPress={() => void reloadProducts()} style={styles.restore}><Text style={[styles.restoreText, { color: colors.accent }]}>Reload plan details</Text></Pressable> : null}
      {status ? <Text style={[styles.status, { color: colors.textSecondary }]}>{status}</Text> : null}
      <Pressable disabled={busy} onPress={() => void (onRestore ? onRestore() : onRefresh())} style={styles.restore}>
        <Text style={[styles.restoreText, { color: colors.accent }]}>Restore purchases / refresh balance</Text>
      </Pressable>
      <Pressable disabled={busy} onPress={() => Linking.openURL('https://play.google.com/store/account/subscriptions?package=com.ssvasia.expertai')} style={styles.restore}>
        <Text style={[styles.restoreText, { color: colors.accent }]}>Manage subscription in Google Play</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 14 },
  heading: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
  note: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 4 },
  cards: { gap: 8, paddingTop: 12, paddingBottom: 2 },
  toggle: { flexDirection: 'row', gap: 8, marginTop: 12 },
  toggleButton: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingVertical: 9 },
  card: { width: 126, minHeight: 118, borderWidth: 1, borderRadius: 13, padding: 10, justifyContent: 'center' },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden' },
  owl: { width: 38, height: 38 },
  name: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  price: { fontFamily: Fonts.sansBold, fontSize: 17, marginTop: 4 },
  per: { fontFamily: Fonts.sans, fontSize: 10, marginTop: 1 },
  details: { borderRadius: 13, padding: 12, marginTop: 8 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  badge: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1 },
  detailText: { fontFamily: Fonts.sans, fontSize: 12, marginTop: 6 },
  planMessage: { fontFamily: Fonts.sansSemiBold, fontSize: 12, lineHeight: 17, marginTop: 8 },
  apps: { fontFamily: Fonts.sans, fontSize: 11, marginTop: 6 },
  benefits: { gap: 4, marginTop: 8 },
  benefit: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16 },
  offerChoices: { flexDirection: 'row', gap: 8, marginTop: 10 },
  offerChoice: { flex: 1, minHeight: 42, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8 },
  trialTerms: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, marginTop: 8, textAlign: 'center' },
  purchase: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  status: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  restore: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  restoreText: { fontFamily: Fonts.sans, fontSize: 12, textDecorationLine: 'underline' },
});
