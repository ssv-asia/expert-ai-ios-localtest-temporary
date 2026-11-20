import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';
import { createPurchaseFlow, getAvailablePurchases, useIAP, type ProductSubscription } from 'expo-iap';

import { Fonts } from '@/constants/theme';
import { APPLE_SUBSCRIPTION_IDS, APPLE_SUBSCRIPTION_SKUS, TIER_STORE_PLANS, type PlanBillingPeriod } from '@/lib/plan-catalog';
import { getSession } from '@/lib/auth';
import { fetchAccountInfo, fetchBalance, verifyAppleSubscription } from '@/lib/gateway-client';
import type { AccountInfo, BalanceInfo } from '@/lib/gateway-client';

type Props = {
  colors: { text: string; textSecondary: string; textTertiary: string; accent: string; border: string; buttonBackground: string };
  onEntitlementUpdated: (balance: BalanceInfo, account: AccountInfo, token: string) => void;
};

export function AppleSubscriptions({ colors, onEntitlementUpdated }: Props) {
  const [period, setPeriod] = useState<PlanBillingPeriod>('monthly');
  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [purchaseFlow] = useState(() => createPurchaseFlow({
    isConsumable: () => false,
    confirmWithBackend: async (purchase) => {
      if (purchase.store !== 'apple') return { status: 'invalid', reason: 'Expected an App Store transaction.' };
      const session = await getSession();
      if (!session) return { status: 'verification_delayed', retryAfterMs: 5000 };
      const transactionId = purchase.id;
      if (!transactionId) return { status: 'verification_delayed', retryAfterMs: 5000 };
      try {
        await verifyAppleSubscription(session.token, {
          productId: purchase.productId,
          transactionId,
        });
        await refreshEntitlementRef.current();
        return { status: 'entitled', alreadyGranted: true };
      } catch (error) {
        // Preserve the transaction for automatic retry; don't finish it on an
        // absent session, transient Gateway failure, or failed verification.
        throw error;
      }
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
    void fetchProductsRef.current({ skus: APPLE_SUBSCRIPTION_SKUS, type: 'subs' }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Could not load App Store plans.');
    });
  }, [iap.connected]);

  useEffect(() => {
    if (!iap.connected) return;
    let cancelled = false;
    void getSession().then((session) => {
      if (!session || cancelled) return;
      // Query StoreKit's current active purchases each time the Plans view opens.
      // The Gateway refreshes access from Apple's latest subscription status.
      return verifyOwnedPurchases().then((outcomes) => {
        if (!cancelled && outcomes.some((outcome) => outcome.status === 'failed')) {
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

  const startPurchase = useCallback(async (sku: string) => {
    if (!iap.connected) {
      setError('The App Store is still connecting. Please try again in a moment.');
      return;
    }
    const session = await getSession();
    if (!session) {
      setError('Sign in to your Expert AI account before subscribing.');
      return;
    }
    // StoreKit can create a valid subscription even if the app exits before
    // Gateway verification, so do not block purchase on a client-side account
    // token. Server verification binds the verified transaction to this session.
    setBusyProduct(sku);
    try {
      await requestPurchaseRef.current({ request: { apple: { sku } }, type: 'subs' });
    } catch (e) {
      setBusyProduct(null);
      const message = e instanceof Error ? e.message : 'The App Store purchase could not start.';
      if (!/cancel/i.test(message)) showError(message);
    }
  }, [iap.connected, showError]);

  const restore = useCallback(async () => {
    if (!iap.connected) {
      setError('The App Store is still connecting. Please try again in a moment.');
      return;
    }
    setRestoring(true);
    setError('');
    try {
      await restorePurchasesRef.current({ onlyIncludeActiveItemsIOS: true, alsoPublishToEventListenerIOS: true });
      // Restore may publish existing transactions; query StoreKit again and
      // verify every active subscription against Apple's current status.
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
    <View style={{ marginTop: 18 }}>
      <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 18, color: colors.text }}>Choose a plan</Text>
      <Text style={{ fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 4 }}>
        Subscribe securely through Apple. Your plan is linked to your Expert AI account and works across supported devices.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {(['weekly', 'monthly'] as const).map((item) => (
          <Pressable key={item} onPress={() => setPeriod(item)} style={{ flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: period === item ? colors.accent : colors.border, backgroundColor: period === item ? colors.buttonBackground : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: Fonts.sansSemiBold, color: colors.text, fontSize: 13 }}>{item === 'weekly' ? 'Weekly' : 'Monthly · 3× allowance'}</Text>
          </Pressable>
        ))}
      </View>
      {!iap.connected ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}><ActivityIndicator color={colors.accent} /><Text style={{ fontFamily: Fonts.sans, color: colors.textSecondary, fontSize: 13 }}>Connecting to App Store…</Text></View> : null}
      {(Object.entries(APPLE_SUBSCRIPTION_IDS) as [string, Record<PlanBillingPeriod, string>][]).map(([tier, ids]) => {
        const sku = ids[period];
        const product = productById.get(sku);
        const plan = TIER_STORE_PLANS[Number(tier)];
        return (
          <View key={sku} style={{ marginTop: 10, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.buttonBackground }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 15, color: colors.text }}>{plan.label}</Text>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 3 }}>{plan.apps.join(' · ')}</Text>
              </View>
              <Pressable disabled={!iap.connected || !product || busyProduct !== null} onPress={() => void startPurchase(sku)} style={{ minWidth: 102, minHeight: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: !iap.connected || !product || busyProduct !== null ? 0.55 : 1 }}>
                {busyProduct === sku ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: Fonts.sansSemiBold, color: '#fff', fontSize: 13 }}>{product?.displayPrice ?? 'Unavailable'}</Text>}
              </Pressable>
            </View>
          </View>
        );
      })}
      {error ? <Text accessibilityRole="alert" style={{ fontFamily: Fonts.sans, color: '#D94F55', fontSize: 12, lineHeight: 17, marginTop: 10 }}>{error}</Text> : null}
      <Pressable onPress={() => void restore()} disabled={restoring || busyProduct !== null} style={{ minHeight: 42, justifyContent: 'center', alignItems: 'center', marginTop: 8, opacity: restoring ? 0.55 : 1 }}>
        {restoring ? <ActivityIndicator color={colors.text} /> : <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>Restore App Store purchases</Text>}
      </Pressable>
      <Text style={{ fontFamily: Fonts.sans, color: colors.textTertiary, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 3 }}>
        Subscription payment, renewal, and cancellation are managed by Apple. Manage or cancel in Apple ID subscription settings.
      </Text>
    </View>
  );
}

