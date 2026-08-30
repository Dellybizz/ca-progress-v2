import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const createRoute = readFileSync(join(root, "app/api/payments/create-order/route.ts"), "utf8");
const verifyRoute = readFileSync(join(root, "app/api/payments/verify/route.ts"), "utf8");
const webhookRoute = readFileSync(join(root, "app/api/payments/webhook/route.ts"), "utf8");
const worker = readFileSync(join(root, "workers/billing/index.ts"), "utf8");
const reconcile = readFileSync(join(root, "supabase/migrations/20260830212000_phase11_payment_idempotency_hardening.sql"), "utf8");

test("create-order requires authentication and price authority stays server-side", () => {
  assert.match(createRoute, /optionalUser\(\)/);
  assert.match(createRoute, /if \(!user\)/);
  assert.match(worker, /as \{ planId\?: unknown \}/);
  assert.match(worker, /subscription_plans\?id=eq\./);
  assert.match(worker, /checkout_enabled=eq\.true/);
  assert.match(worker, /price_subunits/);
  assert.match(worker, /amount: Number\(plan\.price_subunits\)/);
  assert.match(worker, /amount_subunits: Number\(plan\.price_subunits\)/);

  const createOrderBody = worker.slice(worker.indexOf("async function createOrder"), worker.indexOf("async function verifyPayment"));
  assert.doesNotMatch(createOrderBody, /body\?\.(amount|price|currency)/);
  assert.doesNotMatch(createOrderBody, /body\[("|')(amount|price|currency)/);
});

test("verification checks ownership, checkout signature, provider state, amount and currency", () => {
  assert.match(verifyRoute, /optionalUser\(\)/);
  assert.match(worker, /payment_orders\?provider_order_id=eq\.[\s\S]*?user_id=eq\./);
  assert.match(worker, /does not belong to your account/i);
  assert.match(worker, /hmacHex\(provider\.keySecret, `\$\{order\.provider_order_id\}\|\$\{paymentId\}`\)/);
  assert.match(worker, /safeEqual\(expected, signature\.toLowerCase\(\)\)/);
  assert.match(worker, /fetchPayment\(paymentId, provider\)/);
  assert.match(worker, /payment\.order_id !== order\.provider_order_id/);
  assert.match(worker, /payment\.amount !== Number\(order\.amount_subunits\)/);
  assert.match(worker, /payment\.currency !== order\.currency/);
});

test("webhook verifies raw-body signature before trusting the event and re-fetches Razorpay state", () => {
  assert.match(webhookRoute, /invokeBillingService/);
  const webhook = worker.slice(worker.indexOf("async function webhook"), worker.indexOf("export default"));
  assert.match(webhook, /const rawBody = await request\.text\(\)/);
  assert.match(webhook, /x-razorpay-signature/);
  assert.match(webhook, /hmacHex\(secret, rawBody\)/);
  assert.ok(webhook.indexOf("safeEqual(expected, supplied)") < webhook.indexOf("JSON.parse(rawBody)"));
  assert.match(webhook, /fetchPayment\(entity\.id, provider\)/);
  assert.match(webhook, /payment\.amount !== Number\(order\.amount_subunits\)/);
  assert.match(webhook, /payment\.currency !== order\.currency/);
});

test("verify, webhook, duplicate delivery and retries converge on one purchased entitlement", () => {
  assert.match(worker, /source: "verify"/);
  assert.match(worker, /source: "webhook"/);
  assert.match(reconcile, /where provider_order_id=p_provider_order_id for update/i);
  assert.match(reconcile, /on conflict\(provider,provider_event_key\) do nothing/i);
  assert.match(reconcile, /if v_event_id is null then/i);
  assert.match(reconcile, /where source='razorpay' and source_order_id=v_order\.provider_order_id/i);
  assert.match(reconcile, /if found then[\s\S]*?alreadyGranted/i);
  assert.match(reconcile, /phase11_add_plan_duration/i);
});

test("same-tier extension starts from a still-valid expiry and cannot shorten it", () => {
  assert.match(reconcile, /us\.ends_at>coalesce\(p_paid_at,now\(\)\)/i);
  assert.match(reconcile, /if found then v_start=v_current\.ends_at; v_event_kind='extended'/i);
  assert.match(reconcile, /v_end=public\.phase11_add_plan_duration\(v_start,v_plan\.duration_value,v_plan\.duration_unit\)/i);
});
