import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("Phase 0 freezes create-subscription behind a read-only Razorpay state preflight",()=>{
  const worker=read("workers/billing/p4-closure.ts");
  assert.match(worker,/freezeUnsafeSubscriptionCreation\(request\.clone\(\), env\)/);
  assert.ok(worker.indexOf("freezeUnsafeSubscriptionCreation(request.clone(), env)")<worker.indexOf("p4FinalWorker.fetch(request"));
  assert.match(worker,/method: "GET"/);
  assert.match(worker,/api\.razorpay\.com\/v1\/subscriptions/);
  assert.match(worker,/provider_subscription_unverifiable/);
  assert.match(worker,/subscription_state_mismatch/);
  assert.match(worker,/multiple_open_subscriptions/);
});

test("Phase 0 reuses only one verified same-plan created or authenticated subscription",()=>{
  const worker=read("workers/billing/p4-closure.ts");
  assert.match(worker,/verifiedOpen\.length === 1/);
  assert.match(worker,/samePlan && \(current\.providerStatus === "created" \|\| current\.providerStatus === "authenticated"\)/);
  assert.match(worker,/reused: true/);
  assert.match(worker,/phase0Frozen: true/);
  assert.match(worker,/authorizationUrl: current\.authorizationUrl/);
});

test("Phase 0 recognizes terminal and unresolved provider states without mutating them",()=>{
  const worker=read("workers/billing/p4-closure.ts");
  for (const status of ["created","authenticated","active","pending","halted","paused","cancelled","completed","expired"]) assert.match(worker,new RegExp(`"${status}"`));
  assert.match(worker,/TERMINAL_SUBSCRIPTION_STATUSES = new Set\(\["cancelled", "completed", "expired"\]\)/);
  const guard=worker.slice(worker.indexOf("async function freezeUnsafeSubscriptionCreation"),worker.indexOf("async function releaseFailedCheckoutReservation"));
  assert.doesNotMatch(guard,/method: "POST"/);
  assert.doesNotMatch(guard,/\.run\(/);
  assert.doesNotMatch(guard,/UPDATE /);
  assert.doesNotMatch(guard,/DELETE /);
  assert.doesNotMatch(guard,/\/cancel/);
  assert.doesNotMatch(guard,/user_subscriptions/);
});
