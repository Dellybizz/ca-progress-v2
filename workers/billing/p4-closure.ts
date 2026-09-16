import p4FinalWorker from "./p4-final";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean; meta?: { changes?: number } };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};
type D1Database = { prepare(query: string): D1Statement };
type BillingJob =
  | { kind: "webhook"; raw: string; signature: string; eventId: string | null }
  | { kind: "reconcile"; subscriptionId: string; userId: string; reason: string; runId: string | null };
type QueueMessage<T> = { body: T; ack(): void; retry(): void };
type QueueBatch<T> = { messages: QueueMessage<T>[] };
type ScheduledController = { scheduledTime: number };
type Env = {
  DB?: D1Database;
  BILLING_OPS_QUEUE?: { send(message: BillingJob): Promise<void> };
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
};

const now = () => new Date().toISOString();
const database = (env: Env) => {
  if (!env.DB) throw new Error("Billing D1 binding is missing.");
  return env.DB;
};
const clean = (value: unknown, max = 160) => String(value ?? "").trim().slice(0, max);

async function releaseFailedCheckoutReservation(request: Request, response: Response, env: Env) {
  if (response.ok || request.method !== "POST" || new URL(request.url).pathname !== "/create-subscription") return;
  const userId = clean(request.headers.get("x-ca-progress-user-id"), 128);
  if (!userId) return;
  const body = await request.json().catch(() => null) as { requestId?: unknown } | null;
  const requestId = clean(body?.requestId, 100);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) return;
  const claimKey = `checkout_${userId}_${requestId}`.slice(0, 160);
  const stamp = now();
  await database(env).prepare(`UPDATE billing_campaign_claims
    SET state='failed',failed_at=?1,metadata_json=json_set(metadata_json,'$.failure','checkout_pre_provider_failed')
    WHERE claim_key=?2 AND user_id=?3 AND state='reserved' AND provider_subscription_id IS NULL`)
    .bind(stamp, claimKey, userId).run();
}

function safeAuthorizationUrl(value: unknown) {
  const raw = clean(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const allowedHost = url.hostname === "rzp.io" || url.hostname.endsWith(".razorpay.com");
    return url.protocol === "https:" && allowedHost ? url.toString() : null;
  } catch {
    return null;
  }
}

async function providerAuthorizationUrl(subscriptionId: string, env: Env) {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return null;
  const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
    headers: {
      authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      accept: "application/json",
    },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as { short_url?: unknown } | null;
  return safeAuthorizationUrl(payload?.short_url);
}

async function enrichCheckoutResponse(method: string, pathname: string, response: Response, env: Env) {
  if (!response.ok || method !== "POST" || pathname !== "/create-subscription") return response;
  const payload = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
  const subscriptionId = clean(payload?.subscriptionId, 100);
  if (!payload || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return response;
  const authorizationUrl = await providerAuthorizationUrl(subscriptionId, env).catch(() => null);
  if (!authorizationUrl) return response;
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store");
  return new Response(JSON.stringify({ ...payload, authorizationUrl }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function sweepCampaignLifecycle(env: Env) {
  const db = database(env);
  const stamp = now();
  const released = await db.prepare(`UPDATE billing_campaign_claims
    SET state='failed',failed_at=?1,metadata_json=json_set(metadata_json,'$.failure','stale_checkout_reservation')
    WHERE state='reserved' AND provider_subscription_id IS NULL
      AND datetime(reserved_at)<datetime('now','-30 minutes')`)
    .bind(stamp).run();
  const retired = await db.prepare(`UPDATE billing_campaign_versions
    SET state='retired',retired_at=COALESCE(retired_at,?1)
    WHERE state='published'
      AND (datetime(ends_at)<=datetime('now') OR datetime(claim_ends_at)<=datetime('now'))`)
    .bind(stamp).run();
  return {
    releasedReservations: Number(released.meta?.changes ?? 0),
    retiredCampaignVersions: Number(retired.meta?.changes ?? 0),
  };
}

const worker = {
  async fetch(request: Request, env: Env) {
    const evidence = request.clone();
    const method = request.method;
    const pathname = new URL(request.url).pathname;
    const response = await p4FinalWorker.fetch(request, env as never);
    await releaseFailedCheckoutReservation(evidence, response, env).catch(() => undefined);
    return enrichCheckoutResponse(method, pathname, response, env);
  },
  async queue(batch: QueueBatch<BillingJob>, env: Env) {
    return p4FinalWorker.queue(batch as never, env as never);
  },
  async scheduled(controller: ScheduledController, env: Env) {
    await sweepCampaignLifecycle(env);
    return p4FinalWorker.scheduled(controller as never, env as never);
  },
};

export default worker;
