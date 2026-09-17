import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("0054 enables checkout only for the exact monthly plans repaired by 0053",()=>{
  const sql=read("d1/migrations/0054_refinement_phase2_checkout_enablement_repair.sql");
  assert.match(sql,/billing_cycle='monthly'/);
  assert.match(sql,/tier_key IN \('basic','pro'\)/);
  assert.match(sql,/policy-0053-price-repair-/);
  assert.match(sql,/repair\.price_subunits>=100/);
  assert.match(sql,/repair\.currency='INR'/);
  assert.match(sql,/repair\.billing_duration_value=1/);
  assert.match(sql,/repair\.billing_duration_unit='month'/);
  assert.match(sql,/repair\.id=\(/);
  assert.match(sql,/SET checkout_enabled=1/);
  assert.doesNotMatch(sql,/UPDATE plan_policy_versions/i);
  assert.match(sql,/VALUES \('0054'/);
});

test("retained production migration runner includes 0054",()=>{
  const runner=read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(runner,/0054_refinement_phase2_checkout_enablement_repair\.sql/);
  assert.match(runner,/BETWEEN '0012' AND '0055'/);
});
