import { NextResponse, type NextRequest } from "next/server";
import { createNativeAuthTransaction } from "@/lib/auth/cloudflare";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { sanitizeReturnPath } from "@/lib/auth/navigation";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import type { SupportedOAuthProvider } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, data: unknown, status = 200) => NextResponse.json(data, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request) } });
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { provider?: string; pkceChallenge?: string; deviceLabel?: string; appBuild?: number; next?: string } | null;
  const provider: SupportedOAuthProvider | null = body?.provider === "google" ? "google" : body?.provider === "linkedin_oidc" ? "linkedin_oidc" : null;
  if (!provider) return json(request, { error: { code: "NATIVE_PROVIDER_INVALID", message: "Choose Google or LinkedIn.", retryable: false } }, 400);
  try {
    const transaction = await createNativeAuthTransaction({ provider, pkceChallenge: String(body?.pkceChallenge || ""), deviceLabel: String(body?.deviceLabel || ""), appBuild: Number(body?.appBuild), next: sanitizeReturnPath(body?.next) });
    const providerPath = provider === "google" ? "/auth/google" : "/auth/linkedin";
    const authorizationUrl = new URL(providerPath, request.nextUrl.origin);
    authorizationUrl.searchParams.set("client", "mobile");
    authorizationUrl.searchParams.set("native_transaction", transaction.transactionId);
    authorizationUrl.searchParams.set("next", sanitizeReturnPath(body?.next));
    return json(request, { ...transaction, authorizationUrl: authorizationUrl.toString() }, 201);
  } catch {
    return json(request, { error: { code: "NATIVE_AUTH_START_FAILED", message: "Native sign-in could not start.", retryable: true } }, 400);
  }
}
