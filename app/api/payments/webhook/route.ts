import { NextResponse } from "next/server";
import { invokeBillingService } from "@/lib/billing/service-binding";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) return NextResponse.json({ error: "Webhook signature is missing." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const raw = await request.text();
  if (raw.length > 512_000) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  return invokeBillingService({
    path: "/webhook",
    userId: null,
    body: raw,
    contentType: request.headers.get("content-type") || "application/json",
    razorpaySignature: signature,
    razorpayEventId: request.headers.get("x-razorpay-event-id"),
  });
}
