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

test("create-order requires authentication and D1 keeps price authority server-side", () => {
  assert.match(createRoute, /optionalUser\(\)/);
  assert.match(createRoute, /if \(!user\)/);
  assert.match(createRoute, /invokeBillingService/);
  assert.match(worker, /as \{planId\?:unknown\}/);
  assert.match(worker, /SELECT id,tier_key,billing_cycle,name,price_subunits,currency,duration_value,duration_unit FROM subscription_plans WHERE id=\?1 AND active=1 AND checkout_enabled=1 LIMIT 1/);
  assert.match(worker, /price_subunits/);
  assert.match(worker, /amount:Number\(plan\.price_subunits\)/);
  assert.match(worker, /amount_subunits/);

  const createOrderBody = worker.slice(worker.indexOf("async function createOrder"), worker.indexOf("async function verifyPayment"));
  assert.doesNotMatch(createOrderBody, /body\?\.(amount|price|currency)/);
  assert.doesNotMatch(createOrderBody, /body\[("|')(amount|price|currency)/);
});

test("verification checks D1 ownership, checkout signature, provider state, amount and currency", () => {
  assert.match(verifyRoute, /optionalUser\(\)/);
  assert.match(verifyRoute, /invokeBillingService/);
  assert.match(worker, /SELECT \* FROM payment_orders WHERE provider_order_id=\?1 AND user_id=\?2 LIMIT 1/);
  assert.match(worker, /does not belong to your account/i);
  assert.match(worker, /hmacHex\(provider\.keySecret,`\$\{order\.provider_order_id\}\|\$\{paymentId\}`\)/);
  assert.match(worker, /safeEqual\(expected,signature\.toLowerCase\(\)\)/);
  assert.match(worker, /fetchPayment\(paymentId,provider\)/);
  assert.match(worker, /payment\.order_id!==order\.provider_order_id/);
  assert.match(worker, /payment\.amount!==Number\(order\.amount_subunits\)/);
  assert.match(worker, /payment\.currency!==order\.currency/);
});

test("webhook verifies raw-body signature before trusting the event and re-fetches Razorpay state", () => {
  assert.match(webhookRoute, /invokeBillingService/);
  const webhook = worker.slice(worker.indexOf("async function webhook"), worker.indexOf("const billingWorker"));
  assert.match(webhook, /const rawBody=await request\.text\(\)/);
  assert.match(webhook, /x-razorpay-signature/);
  assert.match(webhook, /hmacHex\(secret,rawBody\)/);
  assert.ok(webhook.indexOf("safeEqual(expected,supplied)") < webhook.indexOf("JSON.parse(rawBody)"));
  assert.match(webhook, /fetchPayment\(entity\.id,provider\)/);
  assert.match(webhook, /payment\.amount!==Number\(order\.amount_subunits\)/);
  assert.match(webhook, /payment\.currency!==order\.currency/);
});

test("D1 verify, webhook, duplicate delivery and retries converge on one purchased entitlement", () => {
  assert.match(worker, /source:"verify"/);
  assert.match(worker, /source:"webhook"/);
  assert.match(worker, /SELECT id,verified FROM payment_events WHERE provider='razorpay' AND provider_event_key=\?1 LIMIT 1/);
  assert.match(worker, /if\(duplicate\) return \{ok:true,idempotent:true/);
  assert.match(worker, /SELECT id,ends_at FROM user_subscriptions WHERE source='razorpay' AND source_order_id=\?1 LIMIT 1/);
  assert.match(worker, /if\(already\).*alreadyGranted:true/s);
  assert.match(worker, /db\.batch\(statements\)/);
});

test("D1 same-tier extension starts from a still-valid expiry and cannot shorten it", () => {
  assert.match(worker, /SELECT \* FROM user_subscriptions WHERE user_id=\?1 AND plan_id=\?2 AND status='active' AND \(ends_at IS NULL OR ends_at>\?3\)/);
  assert.match(worker, /Date\.parse\(String\(existing\.ends_at\)\)>Date\.now\(\)\?String\(existing\.ends_at\):paidAt/);
  assert.match(worker, /const endsAt=addDuration\(base,Number\(plan\.duration_value\),String\(plan\.duration_unit\)\)/);
});

test("legacy Phase 11 rollback migration retains the original idempotency and extension hardening", () => {
  assert.match(reconcile, /where provider_order_id=p_provider_order_id for update/i);
  assert.match(reconcile, /on conflict\(provider,provider_event_key\) do nothing/i);
  assert.match(reconcile, /if v_event_id is null then/i);
  assert.match(reconcile, /where source='razorpay' and source_order_id=v_order\.provider_order_id/i);
  assert.match(reconcile, /phase11_add_plan_duration/i);
  assert.match(reconcile, /us\.ends_at>coalesce\(p_paid_at,now\(\)\)/i);
});
