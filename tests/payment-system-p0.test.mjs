import assert from "node:assert/strict";
import test from "node:test";
import { QUERIES, assertReadOnlySql, readJson, classify, safeRows, publicSummary } from "../scripts/payments/collect-p0.mjs";

test("D1 reads accept only exact inventory queries and reject mutations", () => {
  for (const sql of Object.values(QUERIES)) assert.doesNotThrow(() => assertReadOnlySql(sql));
  for (const sql of ["SELECT 1; DELETE FROM app_users", "PRAGMA user_version=3", "WITH x AS (SELECT 1) UPDATE sessions SET revoked_at=NULL", "SELECT 1"]) assert.throws(() => assertReadOnlySql(sql));
});
test("provider write attempts are blocked before network access", async () => {
  let calls = 0;
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) await assert.rejects(readJson("https://api.razorpay.com/v1/subscriptions", { method }, async () => { calls++; }), /forbidden/);
  assert.equal(calls, 0);
});
test("GET failure is observable rather than mistaken for an empty healthy result", async () => {
  await assert.rejects(readJson("https://example.test", {}, async () => ({ ok: false, status: 403 })), /403/);
  assert.deepEqual(await readJson("https://example.test", {}, async (_url, init) => { assert.equal(init.method, "GET"); return { ok: true, json: async () => ({ result: { versions: [] } }) }; }), { versions: [] });
});
test("effective paid policies require mappings and verified intro offers; free policies do not", () => {
  const paid = { active: 1, checkout_enabled: 1, tier_key: "basic", policy_version_id: "p", ready_mapping_count: 1, intro_price_subunits: 2500, provider_offer_id: "offer", provider_offer_verified_at: "2026-09-30" };
  assert.deepEqual(classify([paid]), []);
  assert.equal(classify([{ ...paid, ready_mapping_count: 0 }])[0].code, "effective_policy_mapping_not_ready");
  assert.equal(classify([{ ...paid, provider_offer_verified_at: null }])[0].code, "intro_offer_verification_gap");
  assert.deepEqual(classify([{ active: 1, checkout_enabled: 1, tier_key: "free" }]), []);
});
test("contract and offer references are fingerprinted in evidence", () => {
  const rows = safeRows([{ policy_version_id: "private-policy", provider_offer_id: "private-offer", price_subunits: 5000 }]);
  assert.equal(rows[0].price_subunits, 5000);
  assert.doesNotMatch(JSON.stringify(rows), /private-policy|private-offer/);
});
test("published evidence uses a whitelist and excludes individual contract and transaction references", () => {
  const output = publicSummary({ observations: { effectivePolicies: [{ tier_key: "basic", price_subunits: 5000, policy_version_id: "PRIVATE", provider_offer_id: "PRIVATE" }], contracts: [{ policy_version_id: "PRIVATE", contract_count: 2 }], charges: [{ provider_payment_id: "PRIVATE", amount_subunits: 5000, row_count: 1 }] }, findings: [], coverage: [], safety: {} });
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|policy_version_id|provider_payment_id|provider_offer_id/);
  assert.equal(output.commercial_terms[0].price_subunits, 5000);
  assert.equal(output.contract_counts[0].contract_count, 2);
});

test("supplement retains aggregate issue counts without exporting subscription records", () => {
  const output = publicSummary({ observations: {}, findings: [], coverage: [], safety: {}, constructionIssueCounts: { current_policy_mismatch: 6 }, offerChecks: [{ tier: "basic", independent_read_succeeded: false }], subscriptions: [{ user_id: "PRIVATE" }] });
  assert.equal(output.construction_issue_counts.current_policy_mismatch, 6);
  assert.equal(output.offer_checks[0].independent_read_succeeded, false);
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|user_id/);
});
