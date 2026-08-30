import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { invokeBillingService } from "@/lib/billing/service-binding";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to verify this payment." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const raw = await request.text();
  if (raw.length > 8192) return NextResponse.json({ error: "Payment verification request is too large." }, { status: 413 });
  return invokeBillingService({ path: "/verify", userId: user.id, body: raw, contentType: "application/json" });
}
