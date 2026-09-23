import { NextResponse, type NextRequest } from "next/server";
import { sanitizeReturnPath } from "@/lib/auth/navigation";
import { exchangeOAuthCodeForSession } from "@/lib/auth/provider";
import { applyRememberDevicePreference } from "@/lib/auth/session-cookies";
import { ensureUserBootstrap, resolvePostAuthDestination } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") || "";
  const requestedNext = sanitizeReturnPath(request.nextUrl.searchParams.get("next"));
  const requestedRemember = request.nextUrl.searchParams.get("remember") !== "false";
  if (!code) return NextResponse.redirect(new URL(`/login?error=missing_auth_code&next=${encodeURIComponent(requestedNext)}`, request.nextUrl.origin));

  try {
    const cloudflareResult = await exchangeOAuthCodeForSession(code, state);
    const next = cloudflareResult?.next ?? requestedNext;
    if (!cloudflareResult) await applyRememberDevicePreference(requestedRemember);
    if (cloudflareResult?.clientKind !== "mobile") await ensureUserBootstrap();
    const destination = cloudflareResult?.clientKind === "mobile" ? next : await resolvePostAuthDestination(next);
    if (cloudflareResult?.clientKind === "mobile") {
      const deepLink = new URL("ca-progress://auth/complete");
      deepLink.searchParams.set("next", destination);
      if (!cloudflareResult.nativeExchange) throw new Error("Native OAuth exchange was not created.");
      deepLink.searchParams.set("transaction", cloudflareResult.nativeExchange.transactionId);
      deepLink.searchParams.set("code", cloudflareResult.nativeExchange.exchangeCode);
      return NextResponse.redirect(deepLink);
    }
    return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
  } catch {
    return NextResponse.redirect(new URL(`/login?error=auth_callback_failed&next=${encodeURIComponent(requestedNext)}`, request.nextUrl.origin));
  }
}
