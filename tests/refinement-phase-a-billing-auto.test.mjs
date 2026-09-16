import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { candidateSql } from "../scripts/certify-billing-production-auto.mjs";

test("Phase A auto-discovery only selects provider-verified captured recurring charges", () => {
  assert.match(candidateSql, /razorpay_subscription_charges/);
  assert.match(candidateSql, /ch\.status='captured'/);
  assert.match(candidateSql, /rs\.provider_verified=1/);
  assert.match(candidateSql, /LIMIT 1/);
});

test("Phase A auto-discovery stays read-only and records pending rather than inventing success", async () => {
  const source = await readFile(new URL("../scripts/certify-billing-production-auto.mjs", import.meta.url), "utf8");
  assert.match(source, /result:\s*"pending"/);
  assert.match(source, /No payment was created or mutated/);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?razorpay_/i);
  assert.match(source, /certify-billing-production\.mjs/);
});
