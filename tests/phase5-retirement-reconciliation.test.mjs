import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compareLegacyIdentities, compareSourceSubset } from "../scripts/phase5/retirement-reconcile-core.mjs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("retirement subset reconciliation preserves target-only rows", () => {
  const source = [{ id: "legacy-1", value: "old" }, { id: "legacy-2", value: "same" }];
  const target = [...source, { id: "cloudflare-1", value: "new" }];
  const result = compareSourceSubset(source, target, ["id"], ["id", "value"]);
  assert.equal(result.passed, true);
  assert.equal(result.verifiedCount, 2);
  assert.equal(result.extraTargetRows, 1);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.mismatches, []);
});

test("retirement subset reconciliation rejects missing or changed legacy rows", () => {
  const source = [{ id: "legacy-1", value: "old" }, { id: "legacy-2", value: "same" }];
  const target = [{ id: "legacy-1", value: "changed" }, { id: "cloudflare-1", value: "new" }];
  const result = compareSourceSubset(source, target, ["id"], ["id", "value"]);
  assert.equal(result.passed, false);
  assert.equal(result.missing.length, 1);
  assert.equal(result.mismatches.length, 1);
});

test("legacy identity reconciliation accepts additional Cloudflare users", () => {
  const legacy = [{ id: "u1" }, { id: "u2" }];
  const appUsers = [{ user_id: "u1" }, { user_id: "u2" }, { user_id: "cloudflare-u3" }];
  const identities = [
    { identity_id: "supabase-auth:u1", provider: "supabase_auth", provider_user_id: "u1", application_user_id: "u1" },
    { identity_id: "supabase-auth:u2", provider: "supabase_auth", provider_user_id: "u2", application_user_id: "u2" },
  ];
  const result = compareLegacyIdentities(legacy, appUsers, identities);
  assert.equal(result.passed, true);
  assert.equal(result.verifiedCount, 2);
  assert.equal(result.extraAppUsers, 1);
});

test("final retirement verifier is read-only and Phase 4 strict reconciliation remains intact", () => {
  const retirement = read("scripts/phase5/final-retirement-reconcile.mjs");
  const phase4 = read("scripts/phase4/production-shadow.mjs");
  assert.match(retirement, /mode: "retirement-source-subset"/);
  assert.match(retirement, /readOnly: true/);
  assert.match(retirement, /compareSourceSubset/);
  assert.doesNotMatch(retirement, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\s+(?:INTO\s+)?[A-Za-z_]/i);
  assert.match(phase4, /source\.length===targetCount&&sourceHash===targetHash/);
});

test("Phase 3 workflow runs source-subset reconciliation without repeating the final backup", () => {
  const workflow = read(".github/workflows/phase3-exact-commit-retirement-closure.yml");
  assert.match(workflow, /final-retirement-reconcile\.mjs/);
  assert.match(workflow, /TARGET_RUNTIME_COMMIT: 737df990350061007cd46ff4bc2adc576354a27e/);
  assert.doesNotMatch(workflow, /final-backup\.mjs/);
  assert.doesNotMatch(workflow, /production-shadow\.mjs/);
});
