package com.ssvasia.expertai.billing;

import android.app.Activity;
import android.util.Log;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class PlayBillingModule extends ReactContextBaseJavaModule implements PurchasesUpdatedListener {
  private static final String TAG = "ExpertAiBilling";
  private final Map<String, ProductDetails> productDetails = new HashMap<>();
  private final List<ConnectionRequest> connectionRequests = new ArrayList<>();
  private BillingClient billingClient;
  private boolean connecting;

  private static final class ConnectionRequest {
    final Promise promise;
    final Runnable afterConnect;

    ConnectionRequest(Promise promise, Runnable afterConnect) {
      this.promise = promise;
      this.afterConnect = afterConnect;
    }
  }

  public PlayBillingModule(ReactApplicationContext context) {
    super(context);
  }

  @NonNull
  @Override
  public String getName() {
    return "ExpertAiPlayBilling";
  }

  private void connect(Promise promise, Runnable afterConnect) {
    if (billingClient != null && billingClient.isReady()) {
      afterConnect.run();
      return;
    }
    synchronized (connectionRequests) {
      connectionRequests.add(new ConnectionRequest(promise, afterConnect));
      if (connecting) return;
      connecting = true;
    }
    if (billingClient != null) {
      try { billingClient.endConnection(); } catch (RuntimeException ignored) { }
      billingClient = null;
    }
    billingClient = BillingClient.newBuilder(getReactApplicationContext())
      .setListener(this)
      .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
      .enableAutoServiceReconnection()
      .build();
    billingClient.startConnection(new BillingClientStateListener() {
      @Override
      public void onBillingSetupFinished(@NonNull BillingResult result) {
        List<ConnectionRequest> requests;
        synchronized (connectionRequests) {
          connecting = false;
          requests = new ArrayList<>(connectionRequests);
          connectionRequests.clear();
        }
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
          for (ConnectionRequest request : requests) request.afterConnect.run();
        } else {
          for (ConnectionRequest request : requests) request.promise.reject("BILLING_UNAVAILABLE", result.getDebugMessage());
        }
      }

      @Override
      public void onBillingServiceDisconnected() {
        Log.w(TAG, "Google Play Billing service disconnected");
      }
    });
  }

  @ReactMethod
  public void queryProducts(ReadableArray ids, Promise promise) {
    List<QueryProductDetailsParams.Product> products = new ArrayList<>();
    List<String> requestedIds = new ArrayList<>();
    for (int i = 0; i < ids.size(); i++) {
      String id = ids.getString(i);
      requestedIds.add(id);
      products.add(QueryProductDetailsParams.Product.newBuilder()
        .setProductId(id)
        .setProductType(BillingClient.ProductType.SUBS)
        .build());
    }
    synchronized (productDetails) {
      for (String id : requestedIds) productDetails.remove(id);
    }
    connect(promise, () -> billingClient.queryProductDetailsAsync(
      QueryProductDetailsParams.newBuilder().setProductList(products).build(),
      (BillingResult result, QueryProductDetailsResult response) -> {
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
          promise.reject("PRODUCT_QUERY_FAILED", result.getDebugMessage());
          return;
        }
        WritableArray output = Arguments.createArray();
        for (ProductDetails details : response.getProductDetailsList()) {
          synchronized (productDetails) { productDetails.put(details.getProductId(), details); }
          WritableMap product = Arguments.createMap();
          product.putString("productId", details.getProductId());
          product.putString("title", details.getTitle());
          product.putString("description", details.getDescription());
          WritableArray offers = Arguments.createArray();
          List<ProductDetails.SubscriptionOfferDetails> offerDetails = details.getSubscriptionOfferDetails();
          if (offerDetails != null) {
            for (ProductDetails.SubscriptionOfferDetails offer : offerDetails) {
              WritableMap item = Arguments.createMap();
              item.putString("offerToken", offer.getOfferToken());
              item.putString("basePlanId", offer.getBasePlanId());
              String offerId = offer.getOfferId();
              if (offerId != null) item.putString("offerId", offerId);
              List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
              int trialDays = 0;
              for (ProductDetails.PricingPhase phase : phases) {
                String period = phase.getBillingPeriod();
                if (phase.getPriceAmountMicros() == 0 && period != null && period.matches("P[0-9]+D")) {
                  try { trialDays = Math.max(trialDays, Integer.parseInt(period.substring(1, period.length() - 1))); }
                  catch (NumberFormatException ignored) { }
                }
              }
              item.putInt("trialDays", trialDays);
              if (!phases.isEmpty()) {
                ProductDetails.PricingPhase phase = phases.get(phases.size() - 1);
                item.putString("formattedPrice", phase.getFormattedPrice());
                item.putLong("priceAmountMicros", phase.getPriceAmountMicros());
                item.putString("billingPeriod", phase.getBillingPeriod());
              }
              offers.pushMap(item);
            }
          }
          product.putArray("offers", offers);
          output.pushMap(product);
        }
        promise.resolve(output);
      }
    ));
  }

  @ReactMethod
  public void launchSubscription(String productId, String offerToken, String accountId, Promise promise) {
    ProductDetails details;
    synchronized (productDetails) { details = productDetails.get(productId); }
    Activity activity = getCurrentActivity();
    if (details == null || activity == null) {
      promise.reject("BILLING_NOT_READY", "Load the available plans before starting checkout.");
      return;
    }
    BillingFlowParams.ProductDetailsParams params = BillingFlowParams.ProductDetailsParams.newBuilder()
      .setProductDetails(details)
      .setOfferToken(offerToken)
      .build();
    BillingFlowParams.Builder flow = BillingFlowParams.newBuilder()
      .setProductDetailsParamsList(java.util.Collections.singletonList(params));
    if (accountId != null && !accountId.isEmpty()) flow.setObfuscatedAccountId(accountId);
    BillingResult result = billingClient.launchBillingFlow(activity, flow.build());
    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) promise.resolve(true);
    else promise.reject("BILLING_FLOW_FAILED", result.getDebugMessage());
  }

  @ReactMethod
  public void queryActivePurchases(Promise promise) {
    connect(promise, () -> billingClient.queryPurchasesAsync(
      QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
      (BillingResult result, List<Purchase> purchases) -> {
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
          promise.reject("PURCHASE_QUERY_FAILED", result.getDebugMessage());
          return;
        }
        promise.resolve(purchasesToArray(purchases));
      }
    ));
  }

  @ReactMethod
  public void acknowledgePurchase(String purchaseToken, Promise promise) {
    connect(promise, () -> billingClient.acknowledgePurchase(
      AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchaseToken).build(),
      result -> {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) promise.resolve(true);
        else promise.reject("ACKNOWLEDGE_FAILED", result.getDebugMessage());
      }
    ));
  }

  private WritableArray purchasesToArray(List<Purchase> purchases) {
    WritableArray output = Arguments.createArray();
    for (Purchase purchase : purchases) output.pushMap(purchaseToMap(purchase));
    return output;
  }

  private WritableMap purchaseToMap(Purchase purchase) {
    WritableMap map = Arguments.createMap();
    map.putString("purchaseToken", purchase.getPurchaseToken());
    map.putString("orderId", purchase.getOrderId());
    map.putInt("purchaseState", purchase.getPurchaseState());
    map.putBoolean("acknowledged", purchase.isAcknowledged());
    WritableArray ids = Arguments.createArray();
    for (String id : purchase.getProducts()) ids.pushString(id);
    map.putArray("productIds", ids);
    return map;
  }

  @Override
  public void onPurchasesUpdated(@NonNull BillingResult result, List<Purchase> purchases) {
    WritableMap event = Arguments.createMap();
    event.putInt("responseCode", result.getResponseCode());
    event.putString("debugMessage", result.getDebugMessage());
    if (purchases != null) event.putArray("purchases", purchasesToArray(purchases));
    getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit("ExpertAiPlayBillingPurchase", event);
  }
}
