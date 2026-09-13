import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { certificationMatrix, promotionGates, rollbackTriggers, rolloutStages } from "../config/product-consistency-rollout.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 12 certification matrix covers every mandated product axis", () => {
  for (const key of ["levels", "contentStates", "identities", "plans", "networks", "viewports", "dataStates", "operations"]) assert.ok(certificationMatrix[key]?.length >= 2, key);
  for (const value of ["intermediate-both", "unmapped", "grace", "reconnecting", "conflicting", "rollback"]) assert.ok(Object.values(certificationMatrix).flat().includes(value), value);
});

test("Phase 12 rollout expands only through bounded observable cohorts", () => {
  assert.deepEqual(rolloutStages.map((stage) => stage.audiencePercent), [0, 5, 25, 100]);
  assert.ok(rolloutStages.every((stage) => stage.minimumObservationMinutes > 0));
  assert.equal(promotionGates.openCriticalConsistencyFindings, 0);
  assert.equal(promotionGates.foreignKeyViolations, 0);
});

test("Phase 12 rollback policy is fail-closed and non-destructive", () => {
  assert.equal(rollbackTriggers.authorizationLeakage, true);
  assert.equal(rollbackTriggers.paymentOrEntitlementMismatch, true);
  assert.match(rollbackTriggers.rollbackAction, /Pause expansion/);
  assert.match(rollbackTriggers.rollbackAction, /never delete user data/);
});

test("Phase 12 production gate proves consistency runtime and D1 integrity", () => {
  const script = read("scripts/product-consistency/phase12-certify.mjs");
  assert.match(script, /audit:product-consistency:phase10:gate/);
  assert.match(script, /cf:smoke/);
  assert.match(script, /PRAGMA foreign_key_check/);
  assert.match(script, /CLOUDFLARE_API_TOKEN/);
});

test("Phase 12 certification follows the exact successful deployment SHA", () => {
  const workflow = read(".github/workflows/product-consistency-phase12-certification.yml");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /Cloudflare V2 Deploy/);
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
  assert.match(workflow, /retention-days: 90/);
});
