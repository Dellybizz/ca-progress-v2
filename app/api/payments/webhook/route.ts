import { NextResponse } from "next/server";
import { invokeBillingService } from "@/lib/billing/service-binding";
import {readWebhookBytes} from '@/lib/billing/webhook-body.mjs';

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) return NextResponse.json({ error: "Webhook signature is missing." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  let raw:ArrayBuffer;
  try{raw=await readWebhookBytes(request);}catch{return NextResponse.json({error:'Webhook payload is too large or unreadable.'},{status:413});}
  return invokeBillingService({
    path: "/webhook",
    userId: null,
    body: raw,
    contentType: request.headers.get("content-type") || "application/json",
    razorpaySignature: signature,
    razorpayEventId: request.headers.get("x-razorpay-event-id"),
  });
}
