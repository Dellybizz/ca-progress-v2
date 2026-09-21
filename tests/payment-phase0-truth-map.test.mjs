import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SQL, commercialRisks, databaseConfig, safeMapping, safePolicy } from "../scripts/audit-payment-phase0.mjs";

const source=readFileSync(new URL("../scripts/audit-payment-phase0.mjs",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/payment-phase0-truth-map.yml",import.meta.url),"utf8");

test("Phase 0 D1 inventory is structurally read only",()=>{
  for(const [name,sql] of Object.entries(SQL)){
    assert.match(sql,/^\s*(SELECT|WITH|PRAGMA)\b/i,name);
    assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|VACUUM|REINDEX|ATTACH|DETACH)\b/i,name);
  }
  assert.match(source,/razorpay_operations:\["GET plan","GET offer"\]/);
  assert.doesNotMatch(source,/method:\s*"(POST|PUT|PATCH|DELETE)"[^\n]+api\.razorpay\.com/);
});

test("Phase 0 evidence fingerprints customer and provider identities",()=>{
  assert.match(source,/safeIdentityRows/);
  assert.match(source,/provider_plan_fingerprint/);
  assert.match(source,/provider_offer_fingerprint/);
  assert.doesNotMatch(source,/RAZORPAY_KEY_SECRET[^\n]+evidence/);
  assert.match(source,/raw_payloads_in_evidence:false/);
});

test("Phase 0 freezes the expected commercial baseline as drift evidence",()=>{
  const policies=[
    {tier:"basic",cycle:"monthly",active:true,state:"published",checkout_enabled:true,price_subunits:5000,intro_price_subunits:2500,intro_billing_cycles:1,policy_fingerprint:"basic-policy"},
    {tier:"pro",cycle:"monthly",active:true,state:"published",checkout_enabled:true,price_subunits:15000,policy_fingerprint:"pro-policy"},
  ];
  const mappings=[
    {policy_fingerprint:"basic-policy",kind:"recurring",state:"ready"},
    {policy_fingerprint:"pro-policy",kind:"recurring",state:"ready"},
  ];
  assert.deepEqual(commercialRisks(policies,mappings),[]);
  assert.ok(commercialRisks([{...policies[0],price_subunits:0},policies[1]],mappings).some(r=>r.code==="basic_monthly_price_drift"));
});

test("Phase 0 serializers expose terms but not raw identifiers",()=>{
  const policy=safePolicy({plan_id:"plan-secret",policy_version_id:"policy-secret",tier_key:"basic",billing_cycle:"monthly",active:1,checkout_enabled:1,state:"published",price_subunits:5000,currency:"INR",provider_offer_id:"offer-secret"});
  assert.equal(policy.price_subunits,5000);assert.notEqual(policy.plan_fingerprint,"plan-secret");assert.notEqual(policy.provider_offer_fingerprint,"offer-secret");
  const mapping=safeMapping({id:"mapping-secret",policy_version_id:"policy-secret",internal_plan_id:"plan-secret",provider_plan_id:"provider-secret",price_kind:"recurring",state:"ready",amount_subunits:5000,currency:"INR"});
  assert.notEqual(mapping.provider_plan_fingerprint,"provider-secret");assert.equal(mapping.amount_subunits,5000);
});

test("Phase 0 resolves the production D1 target without exposing it",()=>{
  assert.deepEqual(databaseConfig('{"database_name":"ca-progress-v2","database_id":"abc"}'),{name:"ca-progress-v2",id:"abc"});
  assert.throws(()=>databaseConfig("{}"),/Could not resolve/);
});

test("Phase 0 evidence scan rejects sensitive keys without flagging negative safety assertions",()=>{
  assert.match(workflow,/JSON\.parse\(fs\.readFileSync/);
  assert.match(workflow,/forbidden\.has\(k\.toLowerCase\(\)\)/);
  assert.doesNotMatch(workflow,/s\.toLowerCase\(\)\.includes\(token\)/);
});
