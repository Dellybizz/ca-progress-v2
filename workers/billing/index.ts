type Env = {
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
};

type InternalContext = { supabaseUrl: string; serviceRole: string; userId: string | null };
type PaymentEntity = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at?: number;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function requireInternal(request: Request): InternalContext {
  if (request.headers.get("x-ca-progress-internal") !== "ca-progress-v2-web") throw new Error("Internal billing service only.");
  const supabaseUrl = request.headers.get("x-ca-progress-supabase-url")?.trim() || "";
  const serviceRole = request.headers.get("x-ca-progress-service-role")?.trim() || "";
  const userId = request.headers.get("x-ca-progress-user-id")?.trim() || null;
  if (!/^https:\/\/[^/]+$/.test(supabaseUrl) || !serviceRole) throw new Error("V2 billing database configuration is missing.");
  return { supabaseUrl, serviceRole, userId };
}

function requireProvider(env: Env) {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) throw new Error("Razorpay checkout is not configured on V2 staging yet.");
  return { keyId, keySecret };
}

async function supabase(ctx: InternalContext, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", ctx.serviceRole);
  headers.set("authorization", `Bearer ${ctx.serviceRole}`);
  headers.set("content-type", "application/json");
  headers.set("accept", "application/json");
  const response = await fetch(`${ctx.supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `Billing database request failed (${response.status}).`);
  return data;
}

function basicAuth(keyId: string, keySecret: string) {
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

async function razorpayJson(path: string, provider: { keyId: string; keySecret: string }, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", basicAuth(provider.keyId, provider.keySecret));
  headers.set("content-type", "application/json");
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, { ...init, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error?.description || `Razorpay request failed (${response.status}).`);
  return data;
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchPayment(paymentId: string, provider: { keyId: string; keySecret: string }): Promise<PaymentEntity> {
  return await razorpayJson(`payments/${encodeURIComponent(paymentId)}`, provider) as PaymentEntity;
}

async function reconcile(ctx: InternalContext, input: {
  orderId: string; paymentId: string; payment: PaymentEntity; source: "verify" | "webhook"; eventType: string; eventKey: string;
}) {
  return await supabase(ctx, "rpc/phase11_reconcile_payment", {
    method: "POST",
    body: JSON.stringify({
      p_provider_order_id: input.orderId,
      p_provider_payment_id: input.paymentId,
      p_amount_subunits: input.payment.amount,
      p_currency: input.payment.currency,
      p_provider_status: input.payment.status,
      p_source: input.source,
      p_event_type: input.eventType,
      p_provider_event_key: input.eventKey,
      p_paid_at: input.payment.created_at ? new Date(input.payment.created_at * 1000).toISOString() : new Date().toISOString(),
      p_payload: { payment_status: input.payment.status, payment_id: input.paymentId, order_id: input.orderId },
    }),
  });
}

async function createOrder(request: Request, env: Env, ctx: InternalContext) {
  if (!ctx.userId) return json({ error: "Sign in to choose a paid plan." }, 401);
  const body = await request.json().catch(() => null) as { planId?: unknown } | null;
  const planId = typeof body?.planId === "string" ? body.planId : "";
  if (!planId) return json({ error: "Choose a subscription plan." }, 400);
  const provider = requireProvider(env);
  const plans = await supabase(ctx, `subscription_plans?id=eq.${encodeURIComponent(planId)}&active=eq.true&checkout_enabled=eq.true&select=id,tier_key,billing_cycle,name,price_subunits,currency,duration_value,duration_unit`);
  const plan = Array.isArray(plans) ? plans[0] : null;
  if (!plan || plan.tier_key === "free" || !Number.isInteger(Number(plan.price_subunits)) || Number(plan.price_subunits) < 100) return json({ error: "This paid plan is not available for checkout yet." }, 409);
  const receipt = `cp_${crypto.randomUUID().replaceAll("-", "").slice(0, 28)}`;
  const order = await razorpayJson("orders", provider, {
    method: "POST",
    body: JSON.stringify({ amount: Number(plan.price_subunits), currency: plan.currency, receipt, notes: { ca_progress_user_id: ctx.userId, ca_progress_plan_id: plan.id } }),
  }) as { id?: string; amount?: number; currency?: string; status?: string };
  if (!order.id || Number(order.amount) !== Number(plan.price_subunits) || order.currency !== plan.currency) throw new Error("Razorpay returned an invalid order response.");
  await supabase(ctx, "payment_orders", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ user_id: ctx.userId, plan_id: plan.id, provider: "razorpay", provider_order_id: order.id, receipt, amount_subunits: Number(plan.price_subunits), currency: plan.currency, status: "created" }),
  });
  return json({ orderId: order.id, amount: Number(plan.price_subunits), currency: plan.currency, planName: plan.name, billingCycle: plan.billing_cycle, keyId: provider.keyId });
}

async function verifyPayment(request: Request, env: Env, ctx: InternalContext) {
  if (!ctx.userId) return json({ error: "Sign in to verify this payment." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const orderId = typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "";
  const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";
  if (!orderId || !paymentId || !signature) return json({ error: "Payment verification details are incomplete." }, 400);
  const provider = requireProvider(env);
  const rows = await supabase(ctx, `payment_orders?provider_order_id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(ctx.userId)}&select=id,user_id,provider_order_id,amount_subunits,currency,status`);
  const order = Array.isArray(rows) ? rows[0] : null;
  if (!order) return json({ error: "This payment order does not belong to your account." }, 404);
  const expected = await hmacHex(provider.keySecret, `${order.provider_order_id}|${paymentId}`);
  if (!safeEqual(expected, signature.toLowerCase())) return json({ error: "Payment signature verification failed." }, 400);
  const payment = await fetchPayment(paymentId, provider);
  if (payment.order_id !== order.provider_order_id || payment.amount !== Number(order.amount_subunits) || payment.currency !== order.currency) return json({ error: "Razorpay payment details do not match the server order." }, 409);
  const result = await reconcile(ctx, { orderId: order.provider_order_id, paymentId, payment, source: "verify", eventType: `payment.${payment.status}`, eventKey: `verify:${order.provider_order_id}:${paymentId}` });
  return json({ ok: true, reconciliation: result, providerStatus: payment.status });
}

async function webhook(request: Request, env: Env, ctx: InternalContext) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return json({ error: "Razorpay webhook is not configured on V2 staging yet." }, 503);
  const rawBody = await request.text();
  const supplied = request.headers.get("x-razorpay-signature")?.trim().toLowerCase() || "";
  if (!supplied) return json({ error: "Webhook signature is missing." }, 400);
  const expected = await hmacHex(secret, rawBody);
  if (!safeEqual(expected, supplied)) return json({ error: "Webhook signature verification failed." }, 400);
  const event = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: PaymentEntity } } };
  if (event.event !== "payment.captured" && event.event !== "payment.failed") return json({ ok: true, ignored: true });
  const entity = event.payload?.payment?.entity;
  if (!entity?.id || !entity.order_id) return json({ error: "Webhook payment payload is incomplete." }, 400);
  const provider = requireProvider(env);
  const payment = await fetchPayment(entity.id, provider);
  if (payment.order_id !== entity.order_id || payment.amount !== entity.amount || payment.currency !== entity.currency || payment.status !== entity.status) return json({ error: "Webhook payment does not match Razorpay API state." }, 409);
  const rows = await supabase(ctx, `payment_orders?provider_order_id=eq.${encodeURIComponent(entity.order_id)}&select=id,provider_order_id,amount_subunits,currency`);
  const order = Array.isArray(rows) ? rows[0] : null;
  if (!order) return json({ ok: true, ignored: true, reason: "unknown_order" });
  if (payment.amount !== Number(order.amount_subunits) || payment.currency !== order.currency) return json({ error: "Webhook amount or currency does not match the server order." }, 409);
  const eventKey = request.headers.get("x-razorpay-event-id")?.trim() || `webhook:${await sha256(`${supplied}:${rawBody}`)}`;
  const result = await reconcile(ctx, { orderId: entity.order_id, paymentId: entity.id, payment, source: "webhook", eventType: event.event, eventKey });
  return json({ ok: true, reconciliation: result });
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      const ctx = requireInternal(request);
      const path = new URL(request.url).pathname;
      if (request.method === "POST" && path === "/create-order") return await createOrder(request, env, ctx);
      if (request.method === "POST" && path === "/verify") return await verifyPayment(request, env, ctx);
      if (request.method === "POST" && path === "/webhook") return await webhook(request, env, ctx);
      if (request.method === "GET" && path === "/health") return json({ ok: true, providerConfigured: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET), webhookConfigured: Boolean(env.RAZORPAY_WEBHOOK_SECRET) });
      return json({ error: "Not found." }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing service failed.";
      const status = /not configured|configuration is missing/i.test(message) ? 503 : /not found/i.test(message) ? 404 : 500;
      return json({ error: message }, status);
    }
  },
};
