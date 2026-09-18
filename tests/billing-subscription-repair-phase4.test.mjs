import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessLegacy, assessOfferBinding, legacySql, policySql, repairedSql } from "../scripts/repair-legacy-billing-phase4.mjs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Phase 4 automatic path is audit-first and does not create replacements",()=>{
  const script=read("scripts/repair-legacy-billing-phase4.mjs");
  assert.match(script,/CA_BILLING_PHASE4_MODE\|\|"audit"/);
  assert.match(script,/REPAIR LEGACY INTRO SUBSCRIPTIONS/);
  assert.match(script,/replacements_created:false/);
  assert.match(script,/subscription_rows_deleted:false/);
  assert.doesNotMatch(script,/POST[^\n]*subscriptions["']/);
  assert.doesNotMatch(script,/DELETE FROM razorpay_subscriptions/i);
});

test("Phase 4 targets only zero-payment zero-auth split-plan Basic subscriptions",()=>{
  assert.match(legacySql,/sp\.tier_key='basic'/);
  assert.match(legacySql,/rs\.provider_plan_id<>rs\.recurring_provider_plan_id/);
  assert.match(legacySql,/rs\.status IN \('created','authenticated'\)/);
  assert.match(repairedSql,/rs\.status='cancelled'/);
  assert.match(policySql,/sp\.tier_key='basic'/);
});

test("Phase 4 legacy assessment blocks financial or entitlement evidence",()=>{
  const local={status:"created",paid_count:0,auth_attempts:0,charge_count:0,access_count:0,open_case_count:0,provider_plan_id:"plan_intro",recurring_provider_plan_id:"plan_recurring",provider_subscription_id:"sub_A"};
  const provider={id:"sub_A",status:"created",plan_id:"plan_intro",paid_count:0,auth_attempts:0};
  assert.equal(assessLegacy(local,provider).safe,true);
  assert.equal(assessLegacy({...local,paid_count:1},provider).safe,false);
  assert.equal(assessLegacy({...local,access_count:1},provider).safe,false);
  assert.equal(assessLegacy(local,{...provider,auth_attempts:1}).safe,false);
});

test("Phase 4 offer binding requires the expected Basic policy and explicit dashboard-owner attestation",()=>{
  const policy={recurring_price_subunits:5000,intro_price_subunits:2500,intro_billing_cycles:1};
  assert.equal(assessOfferBinding(policy,"offer_ABC123","DASHBOARD_CREATED_BY_ACCOUNT_OWNER").ready,true);
  assert.equal(assessOfferBinding(policy,"bad","DASHBOARD_CREATED_BY_ACCOUNT_OWNER").ready,false);
  assert.equal(assessOfferBinding({...policy,intro_price_subunits:3000},"offer_ABC123","DASHBOARD_CREATED_BY_ACCOUNT_OWNER").ready,false);
  assert.equal(assessOfferBinding(policy,"offer_ABC123","").ready,false);
});

test("Phase 4 cancellation is bounded to the provider cancel endpoint and local reconciliation",()=>{
  const script=read("scripts/repair-legacy-billing-phase4.mjs");
  assert.match(script,/subscriptions\/"\+encodeURIComponent\(current\.id\)\+"\/cancel/);
  assert.match(script,/cancel_at_cycle_end:0/);
  assert.match(script,/UPDATE razorpay_subscriptions SET status='cancelled'/);
  assert.match(script,/repair\.legacy_intro\.cancelled/);
  assert.match(script,/provider_offer_not_ready/);
  assert.doesNotMatch(script,/offers\\/"\\+encodeURIComponent/);
});
