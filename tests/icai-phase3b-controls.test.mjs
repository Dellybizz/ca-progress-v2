import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 3B persists pause and temporary source exclusion without touching canonical data",()=>{
  const migration=read("d1/migrations/0037_icai_phase3b_operator_controls.sql");
  assert.match(migration,/pause_requested/);assert.match(migration,/paused_at/);assert.match(migration,/excluded_until/);
  assert.doesNotMatch(migration,/DELETE FROM icai_resources/);
});

test("Phase 3B targeted and recovery controls are authorized audited and queue-idempotent",()=>{
  const actions=read("app/(admin)/admin/icai-sync/actions.ts");
  for(const action of ["pause","resume","cancel","skip","recover","restore_item","exclude_source","restore_source","failed_only","retry_source","force"]){assert.match(actions,new RegExp(action));}
  assert.match(actions,/requireAdminCapability\("icai\.run"\)/);
  assert.match(actions,/recordAdminAuditEvent/);
  assert.match(actions,/jobKey\("icai-sync", "targeted"/);
  assert.match(actions,/Confirm stale-lock recovery/);
  assert.match(actions,/excluded_until: null, exclusion_reason: null/);
  assert.doesNotMatch(actions,/delete\(/);
});

test("Phase 3B pauses only after a durable batch and force recheck keeps canonical comparison",()=>{
  const engine=read("workers/icai-sync/sync-engine.ts");
  const worker=read("custom-worker.ts");
  assert.match(engine,/pauseAfterBatchRequested/);assert.match(engine,/stage='paused'/);
  assert.match(engine,/forceRecheck \? \{ \.\.\.source, etag: null, lastModified: null \} : source/);
  assert.match(worker,/result\.status === "paused"/);
  assert.doesNotMatch(engine,/forceRecheck[\s\S]{0,200}DELETE/);
});

test("Phase 3B exposes truthful source and file recovery controls",()=>{
  const panel=read("components/icai/admin-sync-monitor.tsx");
  const live=read("components/icai/sync-live-refresh.tsx");
  for(const label of ["Run failed sources","Run source","Force recheck","Retry failed source","Exclude 24h","Restore source","Restore file","Open ICAI page"]){assert.match(panel,new RegExp(label));}
  assert.doesNotMatch(panel,/>Retry failed batch</);
  assert.match(panel,/excludeIcaiSourceAction/);
  assert.match(panel,/restoreIcaiSourceAction/);
  assert.match(read("components/icai/copy-failure-button.tsx"),/Copy failure details/);
  assert.match(live,/Pause after batch/);assert.match(live,/Resume/);assert.match(live,/Confirm stale lock/);
});
