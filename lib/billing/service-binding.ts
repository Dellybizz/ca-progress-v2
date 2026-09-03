import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { invalidateUserEntitlementCache } from "@/lib/cache/public";

type BillingService = { fetch(request: Request): Promise<Response> };
type BillingInvoke = { path: "/create-order" | "/verify" | "/webhook" | "/entitlement" | "/health"; method?: "GET" | "POST"; userId?: string | null; query?: string; body?: string; contentType?: string; razorpaySignature?: string | null; razorpayEventId?: string | null };

function binding(): BillingService | null {
  try { const { env } = getCloudflareContext(); const value = (env as unknown as Record<string, unknown>).BILLING_SERVICE; return value && typeof (value as BillingService).fetch === "function" ? value as BillingService : null; } catch { return null; }
}
export function billingServiceConfigured() { return Boolean(binding()); }
export async function invokeBillingService(input: BillingInvoke) {
  const service = binding();
  if (!service) return new Response(JSON.stringify({ error: "Billing service is not connected in this environment yet." }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const headers = new Headers({ "x-ca-progress-internal": "ca-progress-v2-web" });
  if (input.userId) headers.set("x-ca-progress-user-id", input.userId);
  if (input.contentType) headers.set("content-type", input.contentType);
  if (input.razorpaySignature) headers.set("x-razorpay-signature", input.razorpaySignature);
  if (input.razorpayEventId) headers.set("x-razorpay-event-id", input.razorpayEventId);
  const response = await service.fetch(new Request(`https://billing.internal${input.path}${input.query ?? ""}`, { method: input.method ?? "POST", headers, body: input.method === "GET" ? undefined : input.body }));
  if ((input.path === "/verify" || input.path === "/webhook") && response.ok) {
    const payload = await response.clone().json().catch(() => null) as { userId?: unknown; reconciliation?: { userId?: unknown } } | null;
    const userId = typeof payload?.userId === "string" ? payload.userId : typeof payload?.reconciliation?.userId === "string" ? payload.reconciliation.userId : null;
    if (userId) await invalidateUserEntitlementCache(userId);
  }
  return response;
}
