export type AppCommercePlatform = "web" | "ios" | "android";
export type AppCommercePolicy = {
  platform: AppCommercePlatform;
  purchaseProvider: "razorpay" | "apple_iap" | "google_play_billing";
  webCheckoutAllowed: boolean;
  providerMutationsAllowed: boolean;
  nativeCheckoutReady: boolean;
  message: string;
};

export const MOBILE_STORE_PRODUCTS = Object.freeze({
  basic_monthly: Object.freeze({ apple: null, google: null }),
  basic_annual: Object.freeze({ apple: null, google: null }),
  pro_monthly: Object.freeze({ apple: null, google: null }),
  pro_annual: Object.freeze({ apple: null, google: null }),
});

export function commercePlatformFromUserAgent(userAgent: string | null | undefined): AppCommercePlatform {
  const match = userAgent?.match(/CAProgressNative\/(ios|android)(?:\/\d+)?/i);
  return match?.[1]?.toLowerCase() === "ios" ? "ios" : match?.[1]?.toLowerCase() === "android" ? "android" : "web";
}

export function commercePolicyForPlatform(platform: AppCommercePlatform): AppCommercePolicy {
  if (platform === "ios") return {
    platform, purchaseProvider: "apple_iap", webCheckoutAllowed: false, providerMutationsAllowed: false, nativeCheckoutReady: false,
    message: "Purchases are unavailable in this preview build. App Store subscriptions will use Apple In-App Purchase after the native store products are approved.",
  };
  if (platform === "android") return {
    platform, purchaseProvider: "google_play_billing", webCheckoutAllowed: false, providerMutationsAllowed: false, nativeCheckoutReady: false,
    message: "Purchases are unavailable in this preview build. Play Store subscriptions will use Google Play Billing after the native store products are approved.",
  };
  return {
    platform, purchaseProvider: "razorpay", webCheckoutAllowed: true, providerMutationsAllowed: true, nativeCheckoutReady: true,
    message: "Website subscriptions use secure Razorpay recurring checkout.",
  };
}

export function commercePolicyFromUserAgent(userAgent: string | null | undefined) {
  return commercePolicyForPlatform(commercePlatformFromUserAgent(userAgent));
}
