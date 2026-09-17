import p4FinalWorker from "./p4-final";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean; meta?: { changes?: number } };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};
type D1Database = { prepare(query: string): D1Statement };
type Row = Record<string, unknown>;
type ProviderSubscriptionSnapshot = { status?: unknown; short_url?: unknown };
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
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
});
const KNOWN_SUBSCRIPTION_STATUSES = new Set(["created", "authenticated", "active", "pending", "halted", "paused", "cancelled", "completed", "expired"]);
const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["cancelled", "completed", "expired"]);

async function providerSubscriptionSnapshot(subscriptionId: string, env: Env) {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) throw new Error("Razorpay recurring checkout is not configured.");
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) throw new Error("Stored Razorpay subscription ID is invalid.");
  const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
    headers: {
      authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Razorpay subscription verification failed (${response.status}).`);
  return await response.json() as ProviderSubscriptionSnapshot;
}

async function freezeUnsafeSubscriptionCreation(request: Request, env: Env) {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/create-subscription") return null;
  if (request.headers.get("x-ca-progress-internal") !== "ca-progress-v2-web") return null;
  const userId = clean(request.headers.get("x-ca-progress-user-id"), 128);
  if (!userId) return null;
  const body = await request.json().catch(() => null) as { planId?: unknown } | null;
  const planId = clean(body?.planId, 100);
  if (!planId) return null;

  const db = database(env);
  const unresolved = await db.prepare(`SELECT provider_subscription_id,plan_id,policy_version_id,provider_plan_id,recurring_provider_plan_id,billing_cycle,recurring_price_subunits,status
    FROM razorpay_subscriptions
    WHERE user_id=?1 AND (status IS NULL OR status NOT IN ('cancelled','completed','expired'))
    ORDER BY created_at DESC LIMIT 21`).bind(userId).all<Row>();
  let rows = unresolved.results ?? [];
  if (rows.length > 20) {
    return json({ error: "Checkout is frozen because this account has too many unresolved subscription records. Reconcile billing before retrying.", code: "subscription_inventory_requires_reconciliation" }, 409);
  }

  if (rows.length === 0) {
    const latest = await db.prepare(`SELECT provider_subscription_id,plan_id,policy_version_id,provider_plan_id,recurring_provider_plan_id,billing_cycle,recurring_price_subunits,status
      FROM razorpay_subscriptions WHERE user_id=?1 ORDER BY created_at DESC LIMIT 1`).bind(userId).first<Row>();
    if (latest) rows = [latest];
  }
  if (rows.length === 0) return null;

  const verifiedOpen: Array<{ local: Row; providerStatus: string; authorizationUrl: string | null }> = [];
  for (const local of rows) {
    const localStatus = clean(local.status, 32);
    if (!KNOWN_SUBSCRIPTION_STATUSES.has(localStatus)) {
      return json({ error: "Checkout is frozen because an existing subscription has an unknown local state. Reconcile billing before retrying.", code: "subscription_state_requires_reconciliation", localStatus }, 409);
    }

    const subscriptionId = clean(local.provider_subscription_id, 100);
    let providerState: ProviderSubscriptionSnapshot;
    try {
      providerState = await providerSubscriptionSnapshot(subscriptionId, env);
    } catch {
      return json({ error: "Checkout is frozen because the existing Razorpay subscription could not be verified. Retry reconciliation before starting another subscription.", code: "provider_subscription_unverifiable" }, 503);
    }

    const providerStatus = clean(providerState.status, 32);
    if (!KNOWN_SUBSCRIPTION_STATUSES.has(providerStatus)) {
      return json({ error: "Checkout is frozen because Razorpay returned an unknown subscription state. Reconcile billing before retrying.", code: "provider_subscription_state_unknown", providerStatus }, 409);
    }

    const localTerminal = TERMINAL_SUBSCRIPTION_STATUSES.has(localStatus);
    const providerTerminal = TERMINAL_SUBSCRIPTION_STATUSES.has(providerStatus);
    if (localTerminal !== providerTerminal) {
      return json({ error: "Checkout is frozen because local and Razorpay subscription states disagree. Reconcile the existing subscription before starting another.", code: "subscription_state_mismatch", localStatus, providerStatus }, 409);
    }
    if (!providerTerminal) {
      verifiedOpen.push({ local, providerStatus, authorizationUrl: safeAuthorizationUrl(providerState.short_url) });
    }
  }

  if (verifiedOpen.length === 0) return null;
  if (verifiedOpen.length === 1) {
    const current = verifiedOpen[0];
    const subscriptionId = clean(current.local.provider_subscription_id, 100);
    const samePlan = clean(current.local.plan_id, 100) === planId;
    const legacySplitPlan = clean(current.local.provider_plan_id, 100) !== clean(current.local.recurring_provider_plan_id, 100);
    if (legacySplitPlan) {
      return json({ error: "This checkout uses the retired introductory-plan switching model and must be repaired before retrying. No new subscription was created.", code: "legacy_intro_plan_requires_repair" }, 409);
    }
    if (samePlan && (current.providerStatus === "created" || current.providerStatus === "authenticated")) {
      const keyId = env.RAZORPAY_KEY_ID?.trim();
      if (!keyId) return json({ error: "Razorpay recurring checkout is not configured." }, 503);
      return json({
        subscriptionId,
        keyId,
        billingCycle: current.local.billing_cycle,
        recurringAmount: current.local.recurring_price_subunits,
        policyVersionId: current.local.policy_version_id,
        reused: true,
        providerStatus: current.providerStatus,
        authorizationUrl: current.authorizationUrl,
        phase0Frozen: true,
      });
    }
  }

  return json({
    error: "An existing Razorpay subscription is still unresolved. Checkout is frozen until that subscription is reconciled; no new subscription was created.",
    code: verifiedOpen.length > 1 ? "multiple_open_subscriptions" : "existing_subscription_requires_reconciliation",
    providerStatuses: verifiedOpen.map((item) => item.providerStatus),
  }, 409);
}

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
  try {
    const payload = await providerSubscriptionSnapshot(subscriptionId, env);
    return safeAuthorizationUrl(payload.short_url);
  } catch {
    return null;
  }
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
    const frozen = await freezeUnsafeSubscriptionCreation(request.clone(), env);
    if (frozen) return frozen;
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
