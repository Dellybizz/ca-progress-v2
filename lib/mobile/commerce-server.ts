import "server-only";
import { NextResponse } from "next/server";
import { commercePolicyFromUserAgent } from "./commerce-policy";

export function nativeCommerceMutationRejection(request: Request) {
  const policy = commercePolicyFromUserAgent(request.headers.get("user-agent"));
  if (policy.webCheckoutAllowed && policy.providerMutationsAllowed) return null;
  return NextResponse.json({
    error: "Web payment-provider actions are unavailable inside the native app.",
    code: "NATIVE_STORE_BILLING_REQUIRED",
    platform: policy.platform,
    requiredProvider: policy.purchaseProvider,
  }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
}
