import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { consumeOtpRateLimit, normalizePhone, requestIp } from "@/lib/auth/phone";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { phone?: unknown } | null;
  const phone = normalizePhone(body?.phone);
  if (!phone) return NextResponse.json({ ok: false, error: "Use a valid phone number with country code, for example +91…" }, { status: 400 });
  const rate = await consumeOtpRateLimit("request", phone, requestIp(request));
  if (!rate.ok) return NextResponse.json({ ok: false, error: rate.error }, { status: rate.status });
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
    if (error) return NextResponse.json({ ok: false, error: "We could not send an OTP. Check the number or try again later." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Phone sign-in is temporarily unavailable." }, { status: 503 });
  }
}
