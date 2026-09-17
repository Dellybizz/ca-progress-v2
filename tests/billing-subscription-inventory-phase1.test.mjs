import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareSubscription, inventorySql } from "../scripts/inventory-billing-subscriptions.mjs";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const fp=(value)=>createHash("sha256").update(String(value)).digest("hex").slice(0,12);

test("Phase 1 production inventory is structurally read-only",()=>{
  const script=read("scripts/inventory-billing-subscriptions.mjs");
  assert.match(inventorySql,/^SELECT/i);
  assert.doesNotMatch(inventorySql,/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE)\b/i);
  assert.match(script,/method:"GET"/);
  assert.doesNotMatch(script,/\/cancel/);
  assert.doesNotMatch(script,/user_subscriptions SET/);
  assert.match(script,/mutations_performed:false/);
});

test("Phase 1 inventory covers identity, plan, pricing, state, authorization, billing and reconciliation evidence",()=>{
  for(const field of [
    "provider_subscription_id","provider_plan_id","provider_offer_id","status","financial_state",
    "recurring_price_subunits","initial_price_subunits","currency","billing_cycle",
    "paid_count","remaining_count","auth_attempts","start_at","current_start","current_end",
    "charge_at","ended_at","provider_verified","last_reconciled_at","charge_count",
    "captured_charge_count","event_count","reconciled_event_count","access_count","open_case_count"
  ]) assert.match(inventorySql,new RegExp(field));
});

test("Phase 1 comparison classifies aligned and mismatched provider state",()=>{
  const base={
    provider_subscription_id:"sub_local",provider_plan_id:"plan_local",provider_offer_id:"offer_local",
    status:"created",auth_attempts:0,total_count:12,paid_count:0,remaining_count:12,provider_verified:1,open_case_count:0,
  };
  const alignedProvider={
    fetch_ok:true,id_fingerprint:fp(base.provider_subscription_id),plan_id_fingerprint:fp(base.provider_plan_id),
    offer_id_fingerprint:fp(base.provider_offer_id),status:"created",auth_attempts:0,total_count:12,paid_count:0,remaining_count:12,
  };
  assert.equal(compareSubscription(base,alignedProvider).category,"healthy");
  assert.equal(compareSubscription({...base,status:"active"},alignedProvider).category,"state_mismatch");
  assert.equal(compareSubscription(base,{fetch_ok:false}).category,"provider_unreachable");
});
