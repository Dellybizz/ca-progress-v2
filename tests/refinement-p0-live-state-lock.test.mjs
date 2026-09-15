import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { p0CommercialTables, refinementP0 } from "../config/refinement-p0-live-state.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("P0 pins the current hotfix line and all production Workers", () => {
  assert.equal(refinementP0.liveBaseBranch, "hotfix/dark-mode-ae0cb36d");
  assert.equal(refinementP0.baseCommit, "62189a4054a25f5e287cbab954375e1c12c6b563");
  assert.deepEqual(refinementP0.workers.map((worker) => worker.name), ["ca-progress-v2", "ca-progress-v2-billing", "ca-progress-v2-icai-sync"]);
  assert.equal(refinementP0.database.latestMigration, "0048_chapter_workspace_controls.sql");
  assert.equal(refinementP0.database.migrationCount, 48);
});

test("P0 retains the complete commercial state inventory", () => {
  for (const table of ["user_subscriptions", "payment_orders", "payment_events", "plan_policy_publications", "entitlement_overrides", "plan_promotions"]) {
    assert.ok(p0CommercialTables.includes(table));
  }
  assert.match(refinementP0.protectedData.join(" "), /subscriptions/);
  assert.match(refinementP0.protectedData.join(" "), /payments/);
});

test("P0 credentialed workflow is read-only and creates rollback evidence", () => {
  const workflow = read(".github/workflows/p0-live-state-lock.yml");
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /wrangler deployments list/);
  assert.match(workflow, /PRAGMA foreign_key_check/);
  assert.match(workflow, /rollback-manifest\.json/);
  assert.doesNotMatch(workflow, /wrangler (deploy\b|rollback\b|d1 migrations apply\b|d1 execute[^\n]*--file\b)/);
});

test("P0 remains a hard stop before P1", () => {
  assert.equal(refinementP0.nextPhase, "P1 — Admin information architecture and user operations");
  assert.match(read("docs/refinement-p0/PHASE_P0_LIVE_STATE_LOCK.md"), /P1 has not started/);
});
