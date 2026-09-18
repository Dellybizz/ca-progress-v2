import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessLegacy, assessOffer, legacySql, policySql, repairedSql } from "../scripts/repair-legacy-billing-phase4.mjs";

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

test("Phase 4 offer assessment requires an active matching flat discount when fields are available",()=>{
  const policy={recurring_price_subunits:5000,intro_price_subunits:2500};
  assert.equal(assessOffer(policy,{id:"offer_ABC123",active:true,discount_type:"flat",discount_value:2500,payment_method:"upi"}).ready,true);
  assert.equal(assessOffer(policy,{id:"offer_ABC123",active:false,discount_type:"flat",discount_value:2500,payment_method:"upi"}).ready,false);
  assert.equal(assessOffer(policy,{id:"offer_ABC123",active:true,discount_type:"flat",discount_value:1000,payment_method:"upi"}).ready,false);
  assert.equal(assessOffer(policy,{id:"offer_ABC123",active:true,discount_type:"percentage",discount_value:2500,payment_method:"upi"}).ready,false);
});

test("Phase 4 cancellation is bounded to the provider cancel endpoint and local reconciliation",()=>{
  const script=read("scripts/repair-legacy-billing-phase4.mjs");
  assert.match(script,/subscriptions\/"\+encodeURIComponent\(current\.id\)\+"\/cancel/);
  assert.match(script,/cancel_at_cycle_end:0/);
  assert.match(script,/UPDATE razorpay_subscriptions SET status='cancelled'/);
  assert.match(script,/repair\.legacy_intro\.cancelled/);
  assert.match(script,/provider_offer_not_ready/);
});
