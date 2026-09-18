import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("P2 adds versioned offer terms and immutable checkout snapshots",()=>{
  const sql=read("d1/migrations/0050_refinement_phase2_commercial_policy.sql");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS plan_policy_offer_terms/);
  assert.match(sql,/intro_price_subunits/);
  assert.match(sql,/intro_billing_cycles/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS payment_order_offer_snapshots/);
  assert.match(sql,/charged_price_subunits/);
  assert.match(sql,/recurring_price_subunits/);
  assert.match(sql,/trg_plan_policy_publish_commercial_validation/);
  assert.match(sql,/VALUES \('0050'/);
  assert.match(read("scripts/apply-retained-d1-migrations.mjs"),/0050_refinement_phase2_commercial_policy\.sql/);
});

test("P2 keeps offer mutations draft-only and audited",()=>{
  const source=read("lib/billing/commercial-policy.ts");
  assert.match(source,/Only a draft policy can be edited/);
  assert.match(source,/plan\.policy\.offer_terms\.save/);
  assert.match(source,/introPrice>Number\(policy\.price_subunits/);
  assert.match(source,/listPublishedPricingOffers/);
  assert.match(source,/listActivePlanEntitlements/);
});

test("P2 admin surface is separated into commercial work areas",()=>{
  const page=read("app/(admin)/admin/plans/page.tsx");
  for(const label of ["Plans","Feature Access","Pricing Versions","Scheduled Changes","Usage"])assert.match(page,new RegExp(label));
  assert.match(page,/Preview as student/);
  assert.match(page,/Publish impact/);
  assert.match(page,/Rollback history/);
  assert.match(page,/savePolicyOfferTermsAction/);
});

test("P2 pricing explains today, recurring and cancellation terms",()=>{
  const client=read("components/billing/pricing-client.tsx");
  assert.match(client,/Due today/);
  assert.match(client,/Recurring/);
  assert.match(client,/Cancellation/);
  assert.match(client,/introRemainingCycles/);
  assert.match(client,/checkoutReady/);
});

test("P2 checkout derives amount server-side and snapshots the complete offer",()=>{
  const worker=read("workers/billing/index.ts");
  assert.match(worker,/paid_count/);
  assert.match(worker,/introApplied/);
  assert.match(worker,/payment_order_offer_snapshots/);
  assert.match(worker,/recurring_price_subunits/);
  assert.match(worker,/trial_days/);
  assert.match(worker,/body\?\.planId/);
  assert.doesNotMatch(worker,/body\?\.amount/);
});

test("P2 production repair replaces only legacy zero-priced monthly policy versions",()=>{
  const sql=read("d1/migrations/0053_refinement_phase2_live_pricing_repair.sql");
  assert.match(sql,/policy-0053-price-repair-/);
  assert.match(sql,/sp\.billing_cycle='monthly'/);
  assert.match(sql,/source\.price_subunits IS NULL OR source\.price_subunits<100/);
  assert.match(sql,/WHEN 'basic' THEN 5000 WHEN 'pro' THEN 15000/);
  assert.match(sql,/WHEN sp\.tier_key='basic' THEN 2500/);
  assert.match(sql,/checkout_enabled=1/);
  assert.match(sql,/price_subunits IS NULL OR price_subunits<100/);
  assert.doesNotMatch(sql,/UPDATE plan_policy_versions\s+SET\s+price_subunits/i);
  assert.match(sql,/VALUES \('0053'/);
  const retained=read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(retained,/0053_refinement_phase2_live_pricing_repair\.sql/);
  assert.match(retained,/BETWEEN '0012' AND '0058'/);
});
