import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { consumeOtpRateLimit, normalizePhone, requestIp } from "@/lib/auth/phone";
import { applyRememberDevicePreference } from "@/lib/auth/session-cookies";
import { ensureUserBootstrap, resolvePostAuthDestination } from "@/lib/auth/server";
import { sanitizeReturnPath } from "@/lib/auth/navigation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { phone?: unknown; token?: unknown; remember?: unknown; next?: unknown } | null;
  const phone = normalizePhone(body?.phone);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const next = sanitizeReturnPath(typeof body?.next === "string" ? body.next : null);
  if (!phone || !/^\d{4,10}$/.test(token)) return NextResponse.json({ ok: false, error: "Enter the phone number and OTP exactly as received." }, { status: 400 });
  const rate = await consumeOtpRateLimit("verify", phone, requestIp(request));
  if (!rate.ok) return NextResponse.json({ ok: false, error: rate.error }, { status: rate.status });
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    if (error) return NextResponse.json({ ok: false, error: "That OTP is invalid or expired." }, { status: 400 });
    await applyRememberDevicePreference(body?.remember !== false);
    await ensureUserBootstrap();
    const destination = await resolvePostAuthDestination(next);
    return NextResponse.json({ ok: true, next: destination });
  } catch {
    return NextResponse.json({ ok: false, error: "We could not verify this OTP right now." }, { status: 503 });
  }
}
