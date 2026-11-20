import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createPurchaseFlow, getAvailablePurchases, useIAP, type ProductSubscription } from 'expo-iap';

import { Fonts } from '@/constants/theme';
import { APPLE_SUBSCRIPTION_IDS, APPLE_SUBSCRIPTION_SKUS, planFeatureLines, TIER_STORE_PLANS, type PlanBillingPeriod } from '@/lib/plan-catalog';
import { getSession } from '@/lib/auth';
import { fetchAccountInfo, fetchBalance, verifyAppleSubscription } from '@/lib/gateway-client';
import type { AccountInfo, BalanceInfo } from '@/lib/gateway-client';

type Props = {
  colors: { text: string; textSecondary: string; textTertiary: string; accent: string; border: string; buttonBackground: string; onTint?: string };
  onEntitlementUpdated: (balance: BalanceInfo, account: AccountInfo, token: string) => void;
};

const planColors: Record<number, string> = {
  11: '#9EDBC9',
  12: '#A9C7FF',
  13: '#C7B7FF',
  14: '#F4C98A',
};
const OWL_BASE = 'https://ssv.asia/content/images/2026/09/';
const OWLS: Record<number, string> = {
  11: '00-starter-256-3.webp',
  12: '02-professional-256-3.webp',
  13: '04-expert-256-3.webp',
  14: '10-foundational-enterprise-256-4.webp',
};

export function AppleSubscriptions({ colors, onEntitlementUpdated }: Props) {
  const [selected, setSelected] = useState(12);
  const [period, setPeriod] = useState<PlanBillingPeriod>('monthly');
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [error, setError] = useState('');
  const [purchaseFlow] = useState(() => createPurchaseFlow({
    isConsumable: () => false,
    confirmWithBackend: async (purchase) => {
      if (purchase.store !== 'apple') return { status: 'invalid', reason: 'Expected an App Store transaction.' };
      const session = await getSession();
      if (!session) return { status: 'verification_delayed', retryAfterMs: 5000 };
      const transactionId = purchase.id;
      if (!transactionId) return { status: 'verification_delayed', retryAfterMs: 5000 };
      await verifyAppleSubscription(session.token, { productId: purchase.productId, transactionId });
      await refreshEntitlementRef.current();
      return { status: 'entitled', alreadyGranted: true };
    },
  }));
  const refreshEntitlementRef = useRef<() => Promise<void>>(async () => {});

  const showError = useCallback((message: string) => {
    setError(message);
    Alert.alert('App Store purchase', message);
  }, []);

  const refreshAccount = useCallback(async () => {
    const session = await getSession();
    if (!session) throw new Error('Sign in again before purchasing a plan.');
    const [balance, account] = await Promise.all([fetchBalance(session.token), fetchAccountInfo(session.token)]);
    onEntitlementUpdated(balance, account, session.token);
  }, [onEntitlementUpdated]);
  refreshEntitlementRef.current = refreshAccount;

  useEffect(() => () => purchaseFlow.dispose(), [purchaseFlow]);

  const iap = useIAP({
    purchaseFlow,
    onPurchaseFlowOutcome: (outcome) => {
      if (outcome.status.status === 'entitled') {
        const wasUserPurchase = busyProduct === outcome.purchase.productId;
        setBusyProduct(null);
        if (wasUserPurchase) Alert.alert('Plan activated', 'Your App Store plan is active on your Expert AI account.');
      } else if (outcome.status.status === 'failed' || outcome.status.status === 'verification_delayed') {
        setBusyProduct(null);
        setError('App Store verification is pending. Keep the app open or tap Restore to retry.');
      }
    },
    onPurchaseError: (purchaseError) => {
      setBusyProduct(null);
      if (purchaseError.code !== 'user-cancelled') showError(purchaseError.message || 'The App Store could not complete this purchase.');
    },
    onError: (iapError) => setError(iapError.message || 'Could not connect to the App Store.'),
  });

  const fetchProductsRef = useRef(iap.fetchProducts);
  fetchProductsRef.current = iap.fetchProducts;
  const requestPurchaseRef = useRef(iap.requestPurchase);
  requestPurchaseRef.current = iap.requestPurchase;
  const restorePurchasesRef = useRef(iap.restorePurchases);
  restorePurchasesRef.current = iap.restorePurchases;

  const reloadProducts = useCallback(async () => {
    if (!iap.connected) {
      setError('The App Store is still connecting. Please try again in a moment.');
      return;
    }
    setRefreshingProducts(true);
    setError('');
    try {
      await fetchProductsRef.current({ skus: APPLE_SUBSCRIPTION_SKUS, type: 'subs' });
      setProductsLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load App Store plans.');
    } finally {
      setRefreshingProducts(false);
    }
  }, [iap.connected]);

  useEffect(() => {
    if (!iap.connected) return;
    let active = true;
    void fetchProductsRef.current({ skus: APPLE_SUBSCRIPTION_SKUS, type: 'subs' })
      .then(() => { if (active) setProductsLoaded(true); })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load App Store plans.');
      });
    return () => { active = false; };
  }, [iap.connected]);

  const verifyOwnedPurchases = useCallback(async () => {
    const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    const outcomes = [];
    for (const purchase of purchases) {
      if (purchase.store !== 'apple' || !APPLE_SUBSCRIPTION_SKUS.includes(purchase.productId)) continue;
      outcomes.push(await purchaseFlow.processPurchase(purchase));
    }
    return outcomes;
  }, [purchaseFlow]);

  useEffect(() => {
    if (!iap.connected) return;
    let cancelled = false;
    void getSession().then((session) => {
      if (!session || cancelled) return;
      return verifyOwnedPurchases().then((outcomes) => {
        if (!cancelled && outcomes.some((outcome) => outcome.status === 'failed' || outcome.status === 'verification_delayed')) {
          setError('A previous App Store purchase is still being verified. Tap Restore to retry.');
        }
      });
    }).catch(() => {
      if (!cancelled) setError('A previous App Store purchase could not be recovered. Tap Restore to retry.');
    });
    return () => { cancelled = true; };
  }, [iap.connected, verifyOwnedPurchases]);

  const products = iap.subscriptions as ProductSubscription[];
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const selectedPlan = TIER_STORE_PLANS[selected];
  const selectedSku = APPLE_SUBSCRIPTION_IDS[selected][period];
  const selectedProduct = productById.get(selectedSku);
  const accent = planColors[selected] ?? colors.accent;
  const foregroundOnAccent = colors.onTint ?? '#FFFFFF';

  const startPurchase = useCallback(async (sku: string) => {
    if (!iap.connected) {
      setError('The App Store is still connecting. Please try again in a moment.');
      return;
    }
    if (!productById.has(sku)) {
      setError('Apple did not return this subscription for the current storefront. Check its App Store Connect availability and product status, then reload plans.');
      return;
    }
    const session = await getSession();
    if (!session) {
      setError('Sign in to your Expert AI account before subscribing.');
      return;
    }
    setBusyProduct(sku);
    setError('');
    try {
      await requestPurchaseRef.current({ request: { apple: { sku } }, type: 'subs' });
    } catch (e) {
      setBusyProduct(null);
      const message = e instanceof Error ? e.message : 'The App Store purchase could not start.';
      if (!/cancel/i.test(message)) showError(message);
    }
  }, [iap.connected, productById, showError]);

  const restore = useCallback(async () => {
    if (!iap.connected) {
      setError('The App Store is still connecting. Please try again in a moment.');
      return;
    }
    setRestoring(true);
    setError('');
    try {
      await restorePurchasesRef.current({ onlyIncludeActiveItemsIOS: true, alsoPublishToEventListenerIOS: true });
      const outcomes = await verifyOwnedPurchases();
      if (outcomes.some((outcome) => outcome.status === 'failed' || outcome.status === 'verification_delayed')) {
        throw new Error('Some App Store transactions are still awaiting verification. Tap Restore again after a moment.');
      }
      await refreshAccount();
      Alert.alert('Purchases restored', 'Your App Store subscriptions and account access have been refreshed.');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not restore App Store purchases.');
    } finally {
      setRestoring(false);
    }
  }, [iap.connected, refreshAccount, showError, verifyOwnedPurchases]);

  if (Platform.OS !== 'ios') return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.text }]}>Choose a plan</Text>
      <Text style={[styles.note, { color: colors.textSecondary }]}>Subscribe securely through Apple. Your plan is linked to your Expert AI account and works across supported devices.</Text>

      <View style={styles.toggle}>
        {(['weekly', 'monthly'] as const).map((item) => (
          <Pressable key={item} onPress={() => setPeriod(item)} style={[styles.toggleButton, { borderColor: colors.border }, period === item && { borderColor: accent, backgroundColor: colors.buttonBackground }]}>
            <Text style={{ color: colors.text, fontFamily: Fonts.sansSemiBold, fontSize: 12 }}>{item === 'monthly' ? 'Monthly · 3× tokens' : 'Weekly'}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
        {(Object.entries(TIER_STORE_PLANS) as [string, (typeof TIER_STORE_PLANS)[number]][]).map(([key, plan]) => {
          const tier = Number(key);
          const sku = APPLE_SUBSCRIPTION_IDS[tier][period];
          const product = productById.get(sku);
          const tint = planColors[tier] ?? colors.accent;
          const active = tier === selected;
          return (
            <Pressable key={tier} onPress={() => setSelected(tier)} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.card, { backgroundColor: colors.buttonBackground, borderColor: active ? tint : colors.border }]}>
              <View style={[styles.icon, { backgroundColor: `${tint}33` }]}><Image source={{ uri: OWL_BASE + OWLS[tier] }} style={styles.owl} resizeMode="contain" /></View>
              <Text style={[styles.name, { color: colors.text }]}>{plan.label}</Text>
              <Text style={[styles.price, { color: colors.text }]}>{product?.displayPrice ?? (productsLoaded ? 'Check availability' : 'Loading price…')}</Text>
              <Text style={[styles.per, { color: colors.textTertiary }]}>per {period === 'monthly' ? 'month' : 'week'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.details, { backgroundColor: colors.buttonBackground, borderColor: colors.border }]}>
        <View style={styles.detailHeader}>
          <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedPlan.label}</Text>
          <Text style={[styles.badge, { color: accent }]}>SELECTED</Text>
        </View>
        <Text style={[styles.detailText, { color: colors.textSecondary }]}>
          {period === 'monthly' ? 'Monthly' : 'Weekly'} · {selectedProduct?.displayPrice ?? (productsLoaded ? 'Price unavailable for this storefront' : 'Checking App Store price…')} per {period === 'monthly' ? 'month' : 'week'}
        </Text>
        <Text style={[styles.planMessage, { color: colors.textSecondary }]}>{selected === 11 ? 'Everyday AI help for questions, research, and daily work.' : selectedPlan.message}</Text>
        <View style={styles.benefits}>
          {planFeatureLines(selectedPlan, period).map((line) => <Text key={line} style={[styles.benefit, { color: colors.textSecondary }]}>✓  {line}</Text>)}
        </View>
        <Text style={[styles.apps, { color: colors.textTertiary }]}>Works with {selectedPlan.apps.join(' · ')}</Text>
      </View>

      {!iap.connected ? (
        <View style={styles.connecting}><ActivityIndicator color={colors.accent} /><Text style={[styles.status, { color: colors.textSecondary }]}>Connecting to the App Store…</Text></View>
      ) : null}
      <Pressable disabled={!iap.connected || !selectedProduct || busyProduct !== null || restoring} onPress={() => void startPurchase(selectedSku)} style={[styles.purchase, { backgroundColor: accent, opacity: !iap.connected || !selectedProduct || busyProduct !== null || restoring ? 0.55 : 1 }]}>
        {busyProduct === selectedSku ? <ActivityIndicator color={foregroundOnAccent} /> : <Text style={{ color: foregroundOnAccent, fontFamily: Fonts.sansSemiBold, fontSize: 13 }}>{selectedProduct ? `Subscribe · ${selectedProduct.displayPrice} / ${period === 'monthly' ? 'month' : 'week'}` : 'Subscription unavailable'}</Text>}
      </Pressable>
      {productsLoaded && !selectedProduct ? <Text style={[styles.status, { color: colors.textSecondary }]}>Apple did not return this product for the current storefront. Confirm the product is cleared for sale and available in App Store Connect.</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {iap.connected && (!productsLoaded || !selectedProduct) ? (
        <Pressable disabled={refreshingProducts} onPress={() => void reloadProducts()} style={styles.restore}>
          {refreshingProducts ? <ActivityIndicator color={colors.accent} /> : <Text style={[styles.restoreText, { color: colors.accent }]}>Reload App Store plans</Text>}
        </Pressable>
      ) : null}
      <Pressable onPress={() => void restore()} disabled={restoring || busyProduct !== null} style={styles.restore}>
        {restoring ? <ActivityIndicator color={colors.text} /> : <Text style={[styles.restoreText, { color: colors.text }]}>Restore App Store purchases</Text>}
      </Pressable>
      <Text style={[styles.legal, { color: colors.textTertiary }]}>Subscription payment, renewal, and cancellation are managed by Apple. Manage or cancel in Apple ID subscription settings.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 14 },
  heading: { fontFamily: Fonts.sansSemiBold, fontSize: 18 },
  note: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 4 },
  toggle: { flexDirection: 'row', gap: 8, marginTop: 12 },
  toggleButton: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingVertical: 9 },
  cards: { gap: 8, paddingTop: 12, paddingBottom: 2 },
  card: { width: 126, minHeight: 118, borderWidth: 1, borderRadius: 13, padding: 10, justifyContent: 'center' },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden' },
  owl: { width: 38, height: 38 },
  name: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  price: { fontFamily: Fonts.sansBold, fontSize: 15, marginTop: 4 },
  per: { fontFamily: Fonts.sans, fontSize: 10, marginTop: 1 },
  details: { borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 8 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  badge: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1 },
  detailText: { fontFamily: Fonts.sans, fontSize: 12, marginTop: 6 },
  planMessage: { fontFamily: Fonts.sansSemiBold, fontSize: 12, lineHeight: 17, marginTop: 8 },
  apps: { fontFamily: Fonts.sans, fontSize: 11, marginTop: 6 },
  benefits: { gap: 4, marginTop: 8 },
  benefit: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16 },
  connecting: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  purchase: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 12 },
  error: { fontFamily: Fonts.sans, color: '#D94F55', fontSize: 12, lineHeight: 17, marginTop: 10 },
  status: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  legal: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 3 },
  restore: { minHeight: 42, justifyContent: 'center', alignItems: 'center', marginTop: 5 },
  restoreText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, textDecorationLine: 'underline' },
});
