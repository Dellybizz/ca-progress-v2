import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { certifySnapshot } from "../scripts/certify-billing-production.mjs";

const good = () => ({
  providerSubscription: { id: "sub_ABC123456789", plan_id: "plan_ABC123456789", status: "active" },
  providerPayment: { id: "pay_ABC123456789", subscription_id: "sub_ABC123456789", amount: 5000, currency: "INR", status: "captured" },
  localSubscriptions: [{ id: "local-sub", user_id: "user-1", plan_id: "internal-plan", provider_subscription_id: "sub_ABC123456789", provider_plan_id: "plan_ABC123456789", status: "active", financial_state: "paid", provider_verified: 1, paid_count: 1 }],
  charges: [{ provider_payment_id: "pay_ABC123456789", razorpay_subscription_id: "local-sub", provider_subscription_id: "sub_ABC123456789", amount_subunits: 5000, currency: "INR", status: "captured" }],
  events: [{ provider_event_id: "evt_1", provider_subscription_id: "sub_ABC123456789", provider_payment_id: "pay_ABC123456789", event_type: "subscription.charged", outcome: "reconciled" }],
  access: [{ id: "access-1", user_id: "user-1", plan_id: "internal-plan", provider_subscription_id: "sub_ABC123456789", source: "razorpay", status: "active" }],
  mismatchCases: [],
  expectedCurrency: "INR",
  expectedAmountSubunits: 5000,
  expectedPlanId: "internal-plan",
});

test("Phase A verifier accepts aligned live subscription evidence", () => {
  const result = certifySnapshot(good());
  assert.equal(result.checks.every((check) => check.passed), true);
  assert.equal(result.reconciledEvents.length, 1);
});

test("Phase A verifier fails closed on amount mismatches", () => {
  const input = good();
  input.charges[0].amount_subunits = 2500;
  assert.throws(() => certifySnapshot(input), /charge amount alignment/);
});

test("Phase A verifier requires reconciled webhook evidence", () => {
  const input = good();
  input.events[0].outcome = "received";
  assert.throws(() => certifySnapshot(input), /reconciled webhook evidence/);
});

test("Phase A verifier requires provider-attributed student access", () => {
  const input = good();
  input.access = [];
  assert.throws(() => certifySnapshot(input), /student paid access exists/);
});

test("Phase A verifier blocks certification while a reconciliation case remains open", () => {
  const input = good();
  input.mismatchCases = [{ id: "case-1", state: "open", reason_code: "amount_mismatch" }];
  assert.throws(() => certifySnapshot(input), /no open reconciliation mismatch/);
});

test("production verifier is read-only and rejects Razorpay test credentials", async () => {
  const source = await readFile(new URL("../scripts/certify-billing-production.mjs", import.meta.url), "utf8");
  assert.match(source, /rzp_live_/);
  assert.match(source, /Phase A certification requires Razorpay live-mode credentials/);
  assert.doesNotMatch(source, /method:\s*["'](?:PATCH|PUT|DELETE)["']/);
  assert.doesNotMatch(source, /subscriptions\/.*method:\s*["']POST["']/s);
  assert.match(source, /billing_reconciliation_cases/);
});
