import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { candidateSql, pricingReadinessSql } from "../scripts/certify-billing-production-auto.mjs";

test("Phase A auto-discovery only selects provider-verified captured recurring charges", () => {
  assert.match(candidateSql, /razorpay_subscription_charges/);
  assert.match(candidateSql, /ch\.status='captured'/);
  assert.match(candidateSql, /rs\.provider_verified=1/);
  assert.match(candidateSql, /LIMIT 1/);
});

test("Phase A verifies live monthly paid pricing before looking for a transaction", () => {
  assert.match(pricingReadinessSql, /subscription_plans/);
  assert.match(pricingReadinessSql, /plan_policy_versions/);
  assert.match(pricingReadinessSql, /sp\.billing_cycle='monthly'/);
  assert.match(pricingReadinessSql, /sp\.tier_key IN \('basic','pro'\)/);
  assert.match(pricingReadinessSql, /active\.state='published'/);
});

test("Phase A auto-discovery stays read-only and records pending rather than inventing success", async () => {
  const source = await readFile(new URL("../scripts/certify-billing-production-auto.mjs", import.meta.url), "utf8");
  assert.match(source, /result === "pending"/);
  assert.match(source, /Production pricing readiness/);
  assert.match(source, /checkout is disabled/);
  assert.match(source, /published price is below ₹1/);
  assert.match(source, /No payment was created or mutated/);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?(?:razorpay_|subscription_plans|plan_policy_versions)/i);
  assert.match(source, /certify-billing-production\.mjs/);
});
