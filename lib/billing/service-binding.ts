import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";

type BillingService = { fetch(request: Request): Promise<Response> };

type BillingInvoke = {
  path: "/create-order" | "/verify" | "/webhook" | "/health";
  method?: "GET" | "POST";
  userId?: string | null;
  body?: string;
  contentType?: string;
  razorpaySignature?: string | null;
  razorpayEventId?: string | null;
};

function binding(): BillingService | null {
  try {
    const { env } = getCloudflareContext();
    const value = (env as unknown as Record<string, unknown>).BILLING_SERVICE;
    return value && typeof (value as BillingService).fetch === "function" ? value as BillingService : null;
  } catch {
    return null;
  }
}

export function billingServiceConfigured() {
  return Boolean(binding());
}

export async function invokeBillingService(input: BillingInvoke) {
  const service = binding();
  if (!service) return new Response(JSON.stringify({ error: "Billing service is not connected in this environment yet." }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const db = getSupabaseAdminRuntimeConfig();
  if (!db.configured) return new Response(JSON.stringify({ error: "V2 billing database configuration is unavailable." }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const headers = new Headers({
    "x-ca-progress-internal": "ca-progress-v2-web",
    "x-ca-progress-supabase-url": db.url,
    "x-ca-progress-service-role": db.serviceRoleKey,
  });
  if (input.userId) headers.set("x-ca-progress-user-id", input.userId);
  if (input.contentType) headers.set("content-type", input.contentType);
  if (input.razorpaySignature) headers.set("x-razorpay-signature", input.razorpaySignature);
  if (input.razorpayEventId) headers.set("x-razorpay-event-id", input.razorpayEventId);
  return service.fetch(new Request(`https://billing.internal${input.path}`, { method: input.method ?? "POST", headers, body: input.method === "GET" ? undefined : input.body }));
}
