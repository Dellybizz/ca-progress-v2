import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "supabase/migrations/20260830211500_phase11_plans_entitlements_billing.sql"), "utf8");
const reconcile = readFileSync(join(root, "supabase/migrations/20260830212000_phase11_payment_idempotency_hardening.sql"), "utf8");
const quota = readFileSync(join(root, "supabase/migrations/20260830212500_phase11_atomic_resource_quota.sql"), "utf8");
const hardening = readFileSync(join(root, "supabase/migrations/20260831030000_phase11_source_truth_hardening.sql"), "utf8");

test("Phase 11 defines the six normalized billing objects with RLS", () => {
  for (const table of [
    "subscription_plans",
    "plan_entitlements",
    "user_subscriptions",
    "payment_orders",
    "payment_events",
    "subscription_events",
  ]) {
    assert.match(schema, new RegExp(`create table(?: if not exists)? public\\.${table}`, "i"));
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }

  assert.match(schema, /unique\s*\(tier_key,\s*billing_cycle\)/i);
  assert.match(schema, /unique\s*\(plan_id,\s*feature_key\)/i);
  assert.match(schema, /provider_order_id text not null unique/i);
  assert.match(hardening, /payment_orders_provider_payment_uidx/i);
});

test("browser roles cannot mutate protected subscription or payment state", () => {
  for (const table of ["user_subscriptions", "payment_orders", "payment_events", "subscription_events"]) {
    assert.match(schema, new RegExp(`create policy [\\s\\S]*? on public\\.${table}[\\s\\S]*?for select`, "i"));
    assert.doesNotMatch(schema, new RegExp(`create policy [\\s\\S]*? on public\\.${table}[\\s\\S]*?for (insert|update|delete)`, "i"));
    assert.match(hardening, new RegExp(`revoke all on table public\\.${table} from anon`, "i"));
  }
  assert.match(schema, /revoke all on function public\.phase11_add_plan_duration/i);
  assert.match(reconcile, /revoke all on function public\.phase11_reconcile_payment/i);
  assert.match(reconcile, /grant execute on function public\.phase11_reconcile_payment[\s\S]*to service_role/i);
});

test("current plan and entitlement resolution expire paid access on the server", () => {
  assert.match(schema, /create or replace function public\.phase11_current_plan_id/i);
  assert.match(schema, /us\.starts_at <= p_at/i);
  assert.match(schema, /us\.ends_at > p_at/i);
  assert.match(schema, /create or replace function public\.phase11_effective_entitlement/i);
  assert.match(schema, /create or replace function public\.phase11_get_my_entitlement/i);
  assert.match(schema, /auth\.uid\(\)/i);
});

test("plan durations are explicit and reconciliation never hardcodes one month", () => {
  assert.match(schema, /duration_value integer not null/i);
  assert.match(schema, /duration_unit text not null/i);
  assert.match(schema, /duration_unit in \('days', 'months', 'years'\)/i);
  assert.match(schema, /phase11_add_plan_duration/i);
  assert.match(schema, /p_duration_value/i);
  assert.match(schema, /p_duration_unit/i);
  assert.doesNotMatch(schema + reconcile + quota + hardening, /\+\s*interval\s*'1\s+month'/i);
});

test("unapproved prices and storage allowances remain unconfigured", () => {
  assert.match(schema, /'basic-monthly'[\s\S]*?null,\s*'INR'[\s\S]*?false/i);
  assert.match(schema, /'basic-annual'[\s\S]*?null,\s*'INR'[\s\S]*?false/i);
  assert.match(schema, /'pro-monthly'[\s\S]*?null,\s*'INR'[\s\S]*?false/i);
  assert.match(schema, /'pro-annual'[\s\S]*?null,\s*'INR'[\s\S]*?false/i);
  assert.match(hardening, /feature_key = 'resources\.storage'/i);
  assert.match(hardening, /configured = false/i);
  assert.match(hardening, /limit_value = null/i);
  assert.match(hardening, /checkout_enabled = false/i);
});

test("resource storage enforcement is aggregate and atomic when a quota is configured", () => {
  assert.match(quota, /pg_advisory_xact_lock/i);
  assert.match(quota, /coalesce\(sum\(ur\.size_bytes\), 0\)/i);
  assert.match(quota, /phase11_effective_entitlement/i);
  assert.match(quota, /storage allowance/i);
  assert.match(quota, /insert into public\.uploaded_resources/i);
});
