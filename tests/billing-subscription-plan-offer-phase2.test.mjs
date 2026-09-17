import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { comparePlan, mappingSql, subscriptionPlanSql, campaignSql } from "../scripts/audit-billing-plan-offer-phase2.mjs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const fp=(v)=>createHash("sha256").update(String(v)).digest("hex").slice(0,12);

test("Phase 2 audit is read-only across D1 and Razorpay",()=>{
  const script=read("scripts/audit-billing-plan-offer-phase2.mjs");
  for(const sql of [mappingSql,subscriptionPlanSql,campaignSql]){
    assert.match(sql,/^SELECT/i);
    assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE)\b/i);
  }
  assert.match(script,/method:"GET"/);
  assert.doesNotMatch(script,/\/cancel/);
  assert.match(script,/mutations_performed:false/);
});

test("Phase 2 covers mappings, provider plans, intro-recurring construction and provider offers",()=>{
  for(const field of ["price_kind","period","interval_value","amount_subunits","currency","provider_plan_id","intro_price_subunits","intro_billing_cycles"]) assert.match(mappingSql,new RegExp(field));
  for(const field of ["provider_plan_id","recurring_provider_plan_id","provider_offer_id","initial_price_subunits","recurring_price_subunits","intro_billing_cycles"]) assert.match(subscriptionPlanSql,new RegExp(field));
  assert.match(campaignSql,/provider_offer_id/);
});

test("Phase 2 plan comparison detects amount and cadence mismatches",()=>{
  const base={
    provider_plan_id:"plan_A",price_kind:"recurring",period:"monthly",interval_value:1,amount_subunits:5000,currency:"INR",
    state:"ready",policy_recurring_price_subunits:5000,intro_price_subunits:2500,billing_duration_unit:"month",billing_duration_value:1,
    policy_version_id:"pv_A",internal_plan_id:"p_A"
  };
  const provider={
    fetch_ok:true,id_fingerprint:fp("plan_A"),period:"monthly",interval:1,item_active:true,amount_subunits:5000,currency:"INR",
    notes_policy_fingerprint:fp("pv_A"),notes_plan_fingerprint:fp("p_A"),notes_price_kind:"recurring"
  };
  assert.equal(comparePlan(base,provider).category,"healthy_plan");
  assert.equal(comparePlan({...base,amount_subunits:2500},provider).category,"plan_mismatch");
  assert.equal(comparePlan({...base,period:"yearly"},provider).category,"plan_mismatch");
});
