import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("P4 adds operational reconciliation state without creating a second human audit ledger",()=>{
  const sql=read("d1/migrations/0052_refinement_phase4_billing_operations_campaigns.sql");
  for(const table of ["billing_reconciliation_runs","billing_reconciliation_cases","billing_operational_alerts","billing_operation_requests","billing_campaigns","billing_campaign_versions","billing_campaign_allowlist","billing_campaign_claims"])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS .*audit/i);
  assert.match(read("lib/billing/p4-admin.ts"),/INSERT INTO admin_audit_events/);
  assert.match(read("workers/billing/p4.ts"),/INSERT INTO admin_audit_events/);
  assert.match(read("scripts/apply-retained-d1-migrations.mjs"),/0052_refinement_phase4_billing_operations_campaigns\.sql/);
});

test("P4 admin billing is searchable and exposes provider ledgers, mismatch queue and campaign reporting",()=>{
  const page=read("app/(admin)/admin/billing/page.tsx"),lib=read("lib/billing/p4-admin.ts");
  assert.match(page,/requireAdminPageCapability\("billing\.read"\)/);
  for(const term of ["Mismatch queue","Subscriptions & provider financial state","Orders & payments","Recurring charges","Webhook deliveries","Access grants","Reconciliation runs","Operational alerts","Campaigns"])assert.match(page,new RegExp(term.replace(/[&]/g,"&")));
  for(const term of ["auth_identities","provider_order_id","provider_payment_id","provider_subscription_id","plan_id"])assert.match(lib,new RegExp(term));
  assert.match(lib,/campaign_liability/);
});

test("P4 settlement operations are owner bounded, confirmed, idempotent and provider authoritative",()=>{
  const worker=read("workers/billing/p4.ts"),actions=read("app/(admin)/admin/billing/actions.ts");
  assert.match(worker,/ownerRole/);assert.match(worker,/confirmationFor/);assert.match(worker,/billing_operation_requests/);assert.match(worker,/request_key/);assert.match(worker,/p3Worker\.fetch/);assert.doesNotMatch(worker,/mark[_ ]paid/i);
  assert.match(actions,/requireAdminCapability\("billing\.manage"\)/);assert.match(actions,/owner.*parent_owner|parent_owner.*owner/s);
});

test("P4 offloads signed webhooks and schedules bounded provider reconciliation",()=>{
  const worker=read("workers/billing/p4.ts"),wrangler=read("workers/billing/wrangler.jsonc");
  assert.match(worker,/x-razorpay-signature/);assert.match(worker,/BILLING_OPS_QUEUE\.send/);assert.match(worker,/async queue/);assert.match(worker,/async scheduled/);assert.match(worker,/LIMIT 75/);assert.match(worker,/stale_provider_reconciliation/);
  assert.match(wrangler,/BILLING_OPS_QUEUE/);assert.match(wrangler,/ca-progress-v2-billing-ops/);assert.match(wrangler,/15 \* \* \* \*/);
});

test("P4 campaigns are versioned and atomically enforce caps, allowlists and per-user limits",()=>{
  const sql=read("d1/migrations/0052_refinement_phase4_billing_operations_campaigns.sql");
  assert.match(sql,/UNIQUE\(campaign_id,version\)/);assert.match(sql,/billing_campaign_claim_validate/);assert.match(sql,/max_redemptions/);assert.match(sql,/first_n_limit/);assert.match(sql,/per_user_limit/);assert.match(sql,/billing_campaign_allowlist/);assert.match(sql,/claimed_count=claimed_count\+1/);assert.match(sql,/campaign_claim_ineligible_or_exhausted/);
});

test("P4 free access and rewards use normal subscription policy and event contracts",()=>{
  const lib=read("lib/billing/p4-admin.ts");
  assert.match(lib,/user_subscriptions/);assert.match(lib,/manual/);assert.match(lib,/subscription_policy_contracts/);assert.match(lib,/subscription_events/);assert.match(lib,/billing_campaign_claims/);assert.match(lib,/'granted'/);
});

test("P4 monetary campaigns require approved Razorpay offer linkage before publish",()=>{
  const lib=read("lib/billing/p4-admin.ts"),sql=read("d1/migrations/0052_refinement_phase4_billing_operations_campaigns.sql");
  assert.match(lib,/Paid discount campaigns require an approved Razorpay offer ID/);assert.match(sql,/provider_offer_id/);assert.match(sql,/offer_\*/);
});