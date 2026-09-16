import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { candidateSql, pendingSubscriptionSql, pricingReadinessSql } from "../scripts/certify-billing-production-auto.mjs";

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

test("Phase A diagnoses the latest open recurring checkout without customer data", () => {
  assert.match(pendingSubscriptionSql, /razorpay_subscriptions/);
  assert.match(pendingSubscriptionSql, /rs\.status IN \('created','authenticated','pending','halted'\)/);
  assert.match(pendingSubscriptionSql, /rs\.financial_state IN \('unpaid','failed'\)/);
  assert.match(pendingSubscriptionSql, /razorpay_subscription_events/);
  assert.doesNotMatch(pendingSubscriptionSql, /\b(?:user_id|customer_email|customer_contact)\b/i);
});

test("Phase A provider diagnostics are sanitized and read-only", async () => {
  const source = await readFile(new URL("../scripts/certify-billing-production-auto.mjs", import.meta.url), "utf8");
  assert.match(source, /\/v1\/subscriptions\//);
  assert.match(source, /authorization_expired/);
  assert.match(source, /short_url_present/);
  assert.match(source, /provider_subscription_fingerprint/);
  assert.doesNotMatch(source, /checkout_diagnostic:.*keySecret/s);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?(?:razorpay_|subscription_plans|plan_policy_versions)/i);
});

test("Phase A auto-discovery stays read-only and records pending rather than inventing success", async () => {
  const source = await readFile(new URL("../scripts/certify-billing-production-auto.mjs", import.meta.url), "utf8");
  assert.match(source, /result === "pending"/);
  assert.match(source, /Production pricing readiness/);
  assert.match(source, /Latest open checkout diagnostic/);
  assert.match(source, /checkout is disabled/);
  assert.match(source, /published price is below ₹1/);
  assert.match(source, /No payment, subscription or entitlement was created or mutated/);
  assert.match(source, /certify-billing-production\.mjs/);
});
