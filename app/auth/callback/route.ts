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
    await ensureUserBootstrap();
    const destination = await resolvePostAuthDestination(next);
    return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
  } catch {
    return NextResponse.redirect(new URL(`/login?error=auth_callback_failed&next=${encodeURIComponent(requestedNext)}`, request.nextUrl.origin));
  }
}
