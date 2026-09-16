import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("P4 closure releases a campaign reservation when checkout fails before provider binding",()=>{
  const worker=read("workers/billing/p4-closure.ts");
  assert.match(worker,/response\.ok/);
  assert.match(worker,/\/create-subscription/);
  assert.match(worker,/state='failed'/);
  assert.match(worker,/checkout_pre_provider_failed/);
  assert.match(worker,/state='reserved' AND provider_subscription_id IS NULL/);
  assert.match(worker,/claimKey/);
});

test("P4 closure reclaims stale first-N inventory after crashes or interrupted checkout",()=>{
  const worker=read("workers/billing/p4-closure.ts");
  const sql=read("d1/migrations/0052_refinement_phase4_billing_operations_campaigns.sql");
  assert.match(worker,/stale_checkout_reservation/);
  assert.match(worker,/datetime\(reserved_at\)<datetime\('now','-30 minutes'\)/);
  assert.match(worker,/provider_subscription_id IS NULL/);
  assert.match(sql,/OLD\.state='reserved' AND NEW\.state IN \('failed','revoked'\)/);
  assert.match(sql,/claimed_count=MAX\(0,claimed_count-1\)/);
});

test("P4 closure retires expired published campaigns and preserves the established worker chain",()=>{
  const worker=read("workers/billing/p4-closure.ts");
  assert.match(worker,/state='retired'/);
  assert.match(worker,/datetime\(ends_at\)<=datetime\('now'\)/);
  assert.match(worker,/datetime\(claim_ends_at\)<=datetime\('now'\)/);
  assert.match(worker,/p4FinalWorker\.fetch/);
  assert.match(worker,/p4FinalWorker\.queue/);
  assert.match(worker,/p4FinalWorker\.scheduled/);
});

test("billing deployment enters through the P4 closure worker",()=>{
  const config=read("workers/billing/wrangler.jsonc");
  assert.match(config,/"main": "\.\/p4-closure\.ts"/);
  assert.match(config,/ca-progress-v2-billing-ops/);
  assert.match(config,/15 \* \* \* \*/);
});
