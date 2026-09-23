import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = path => readFileSync(join(process.cwd(), path), "utf8");

test("Phase 10 separates web Razorpay from native store billing", () => {
  const policy = read("lib/mobile/commerce-policy.ts");
  assert.match(policy, /CAProgressNative\\\/\(ios\|android\)/);
  assert.match(policy, /purchaseProvider: "razorpay"/);
  assert.match(policy, /purchaseProvider: "apple_iap"/);
  assert.match(policy, /purchaseProvider: "google_play_billing"/);
  assert.match(policy, /webCheckoutAllowed: false/);
});

test("native preview cannot call website payment-provider mutation routes", () => {
  const guard = read("lib/mobile/commerce-server.ts");
  assert.match(guard, /NATIVE_STORE_BILLING_REQUIRED/);
  assert.match(guard, /status: 409/);
  for (const route of ["create-order", "create-subscription", "verify", "verify-subscription", "subscription-action"])
    assert.match(read(`app/api/payments/${route}/route.ts`), /nativeCommerceMutationRejection/);
});

test("native pricing is read-only and does not render Razorpay checkout", () => {
  const pricing = read("components/billing/pricing-client.tsx");
  const page = read("app/(student)/pricing/page.tsx");
  assert.match(page, /commercePolicyFromUserAgent/);
  assert.match(pricing, /NativeStorePricing/);
  assert.match(pricing, /Store purchase unavailable/);
  assert.match(pricing, /No Razorpay checkout is loaded inside the native app/);
  assert.match(pricing, /if \(!props\.commercePolicy\.webCheckoutAllowed\)/);
});

test("store product IDs fail closed until Phase 11 configuration", () => {
  const policy = read("lib/mobile/commerce-policy.ts");
  const release = read("config/app-release.ts");
  const configRoute = read("app/api/app-config/route.ts");
  for (const key of ["basic_monthly", "basic_annual", "pro_monthly", "pro_annual"])
    assert.match(policy, new RegExp(`${key}:`));
  assert.match(policy, /apple: null, google: null/);
  assert.match(release, /billing: "apple_iap", checkoutReady: false/);
  assert.match(release, /billing: "google_play_billing", checkoutReady: false/);
  assert.match(configRoute, /storeProducts: MOBILE_STORE_PRODUCTS/);
});

test("mobile parity publishes the billing boundary", () => {
  const parity = read("config/mobile-feature-parity.ts");
  assert.match(parity, /id: "billing"/);
  assert.match(parity, /platform-specific purchase providers/);
  assert.match(parity, /approved store products and bridge/);
});
