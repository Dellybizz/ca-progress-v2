import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyRememberDevicePreference } from "@/lib/auth/session-cookies";
import { ensureUserBootstrap, resolvePostAuthDestination } from "@/lib/auth/server";
import { sanitizeReturnPath } from "@/lib/auth/navigation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = sanitizeReturnPath(request.nextUrl.searchParams.get("next"));
  const remember = request.nextUrl.searchParams.get("remember") !== "false";
  if (!code) return NextResponse.redirect(new URL(`/login?error=missing_auth_code&next=${encodeURIComponent(next)}`, request.nextUrl.origin));

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    await applyRememberDevicePreference(remember);
    await ensureUserBootstrap();
    const destination = await resolvePostAuthDestination(next);
    return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
  } catch {
    return NextResponse.redirect(new URL(`/login?error=auth_callback_failed&next=${encodeURIComponent(next)}`, request.nextUrl.origin));
  }
}
