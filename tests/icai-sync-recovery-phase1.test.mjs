import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("ICAI recovery stores durable stage, heartbeat and cooperative controls", () => {
  const migration = read("d1/migrations/0026_icai_sync_recovery.sql");
  const runtime = read("workers/icai-sync/runtime-control.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_sync_runtime/);
  assert.match(migration, /heartbeat_at TEXT NOT NULL/);
  assert.match(migration, /cancel_requested INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /skip_source_requested INTEGER NOT NULL DEFAULT 0/);
  assert.match(runtime, /recoverStaleRuns/);
  assert.match(runtime, /SyncCancelledError/);
  assert.match(runtime, /SyncSourceSkippedError/);
});

test("ICAI engine reports truthful stages and preserves data when a source is skipped", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  for (const stage of [
    "fetching",
    "validating",
    "parsing",
    "comparing",
    "writing",
  ]) {
    assert.match(engine, new RegExp(`stage\\(\\"${stage}\\"`));
  }
  assert.match(engine, /setStage\(runtime\.db, runId, "finalizing"\)/);
  assert.match(engine, /Last verified data was preserved/);
  assert.match(engine, /Source exceeded the two-minute processing limit/);
});

test("ICAI admin exposes live stage, skip, cancel and stale recovery controls", () => {
  const panel = read("components/icai/admin-sync-monitor.tsx");
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  assert.match(panel, /Live worker state/);
  assert.match(panel, /Skip current source/);
  assert.match(panel, /Cancel run/);
  assert.match(panel, /Recover stalled run/);
  assert.match(actions, /intent === "recover"/);
  assert.match(actions, /heartbeat stopped/);
});

test("Cloudflare deployment applies the ICAI recovery migration before rollout", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const retainedMigrations = read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(workflow, /npm run cf:migrate:retained/);
  assert.match(retainedMigrations, /0026_icai_sync_recovery\.sql/);
});
