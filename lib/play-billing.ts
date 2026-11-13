import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type PlayOffer = { offerToken: string; basePlanId: string; offerId?: string; trialDays?: number; formattedPrice?: string; priceAmountMicros?: number; billingPeriod?: string };
export type PlayProduct = { productId: string; title: string; description: string; offers: PlayOffer[]; available?: boolean };
export type PlayPurchase = { purchaseToken: string; orderId?: string; purchaseState: number; acknowledged: boolean; productIds: string[] };

const native = Platform.OS === 'android' ? NativeModules.ExpertAiPlayBilling : null;
const emitter = native ? new NativeEventEmitter(native) : null;
const productCache = new Map<string, PlayProduct>();
const productQueries = new Map<string, Promise<PlayProduct[]>>();

export function isPlayBillingAvailable() { return Platform.OS === 'android' && !!native; }
export async function queryPlayProducts(productIds: string[], options: { forceRefresh?: boolean } = {}): Promise<PlayProduct[]> {
  if (!native) return [];
  const ids = [...new Set(productIds)];
  const cacheResult = () => ids.map((id) => productCache.get(id) ?? ({
    productId: id, title: id, description: '', offers: [], available: false,
  }));
  if (!options.forceRefresh && ids.every((id) => productCache.has(id))) return cacheResult();

  const key = [...ids].sort().join('|');
  const existing = productQueries.get(key);
  if (existing) return existing;

  const request = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const products = await new Promise<PlayProduct[]>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Google Play is taking longer than expected. Reload plans to retry.')), 15_000);
          native.queryProducts(ids).then(
            (items: PlayProduct[]) => {
              clearTimeout(timeout);
              const returned = new Set(items.map((product) => product.productId));
              resolve([
                ...items.map((product) => ({ ...product, available: product.offers.length > 0 })),
                ...ids.filter((productId) => !returned.has(productId)).map((productId) => ({
                  productId, title: productId, description: '', offers: [], available: false,
                })),
              ]);
            },
            (error: unknown) => { clearTimeout(timeout); reject(error); },
          );
        });
        for (const product of products) productCache.set(product.productId, product);
        return products;
      } catch (error) {
        lastError = error;
        if (attempt === 0 && !(error instanceof Error && error.message.includes('taking longer than expected'))) {
          await new Promise((resolve) => setTimeout(resolve, 450));
          continue;
        }
        break;
      }
    }
    // A failed refresh must not erase a previously successful Play response.
    if (ids.every((id) => productCache.has(id))) return cacheResult();
    throw lastError instanceof Error ? lastError : new Error('Google Play plan details could not be loaded.');
  })();
  productQueries.set(key, request);
  try {
    return await request;
  } finally {
    if (productQueries.get(key) === request) productQueries.delete(key);
  }
}
export function prefetchPlayProducts(productIds: string[]): void {
  if (native) void queryPlayProducts(productIds).catch(() => {});
}
export async function launchPlaySubscription(productId: string, offerToken: string, accountId?: string): Promise<boolean> {
  if (!native) throw new Error('Google Play Billing is only available on Android.');
  return native.launchSubscription(productId, offerToken, accountId ?? '');
}
export async function queryPlayPurchases(): Promise<PlayPurchase[]> {
  if (!native) return [];
  return native.queryActivePurchases();
}
export async function acknowledgePlayPurchase(purchaseToken: string): Promise<boolean> {
  if (!native) return false;
  return native.acknowledgePurchase(purchaseToken);
}
export function subscribeToPlayPurchases(listener: (event: { responseCode: number; debugMessage?: string; purchases?: PlayPurchase[] }) => void) {
  if (!emitter) return { remove() {} };
  return emitter.addListener('ExpertAiPlayBillingPurchase', listener);
}
