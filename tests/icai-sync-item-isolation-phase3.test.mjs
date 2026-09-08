import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 3 stores durable per-item execution diagnostics and auditable controls", () => {
  const migration = read("d1/migrations/0027_icai_sync_item_isolation.sql");
  for (const field of [
    "run_id TEXT NOT NULL",
    "source_id TEXT NOT NULL",
    "item_url TEXT NOT NULL",
    "item_type TEXT NOT NULL",
    "status TEXT NOT NULL",
    "stage TEXT NOT NULL",
    "attempts INTEGER NOT NULL",
    "http_status INTEGER",
    "duration_ms INTEGER",
    "bytes_fetched INTEGER",
    "parsed_count INTEGER",
    "failure_category TEXT",
    "failure_message TEXT",
    "skip_reason TEXT",
    "retry_eligible INTEGER",
  ]) assert.match(migration, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_sync_item_exclusions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_sync_control_audit/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_source_controls/);
});

test("Phase 3 isolates academic links and continues after terminal item failures", () => {
  const isolation = read("workers/icai-sync/item-isolation.ts");
  assert.match(isolation, /extractAcademicItemCandidates/);
  assert.match(isolation, /for \(const candidate of candidates\)/);
  assert.match(isolation, /ITEM_TIMEOUT_MS = 30_000/);
  assert.match(isolation, /MAX_ITEM_HTML_BYTES = 512_000/);
  assert.match(isolation, /redirect: "manual"/);
  assert.match(isolation, /httpStatus: fetched\.httpStatus/);
  assert.match(isolation, /status: timedOut \? "timed_out" : "failed"/);
  assert.match(isolation, /retryEligible: true/);
  assert.match(isolation, /payloads\.push\(parsed\)/);
  assert.match(isolation, /continue;/);
  assert.match(isolation, /activeExclusion/);
});

test("Phase 3 prevents parser/item failure from becoming authoritative removal", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /processIsolatedSourceItems/);
  assert.match(engine, /source\.authoritativeListing && !unsafeAfterPayload && !targetedRetry/);
  assert.match(engine, /Last-known-good source validators were preserved/);
  assert.match(engine, /Suspicious parser item-count drop/);
  assert.match(engine, /restoreTargetedRetrySourceState/);
  assert.match(engine, /markSourcePartial/);
});

test("Phase 3 retries only failed or timed-out URLs rather than successful items", () => {
  const isolation = read("workers/icai-sync/item-isolation.ts");
  const engine = read("workers/icai-sync/sync-engine.ts");
  const jobs = read("lib/jobs/execute.ts");
  assert.match(isolation, /loadRetrySelection/);
  assert.match(isolation, /retry_eligible=1/);
  assert.match(isolation, /status='timed_out'/);
  assert.match(isolation, /resolveSuccessfulRetryItems/);
  assert.match(isolation, /SET retry_eligible=0/);
  assert.match(engine, /retrySelection\?\.urlsBySource\.get\(source\.id\)/);
  assert.match(engine, /force: targetedRetry/);
  assert.match(jobs, /retryItemId/);
});

test("Phase 3 exposes cooperative item controls and safe exclusion rules", () => {
  const runtime = read("workers/icai-sync/runtime-control.ts");
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  const panel = read("components/icai/sync-live-refresh.tsx");
  assert.match(runtime, /SyncItemSkippedError/);
  assert.match(runtime, /SyncRemainingItemsSkippedError/);
  assert.match(actions, /skip_item/);
  assert.match(actions, /skip_remaining/);
  assert.match(actions, /exclude_temp/);
  assert.match(actions, /exclude_permanent/);
  assert.match(actions, /PERMANENT/);
  assert.match(actions, /parent_owner/);
  assert.match(actions, /pause_source/);
  assert.match(panel, /Retry failed items only/);
  assert.match(panel, /Retry timed-out items only/);
  assert.match(panel, /Copy URL/);
  assert.match(panel, /Administrative note/);
});

test("Phase 3 live monitor includes item terminal results and technical failures", () => {
  const status = read("lib/icai/status-query.ts");
  const types = read("lib/icai/live-status.ts");
  assert.match(status, /icai_sync_items/);
  assert.match(status, /failureCategory/);
  assert.match(status, /retryEligible/);
  assert.match(types, /IcaiSyncLiveItemState/);
  assert.match(types, /itemResults/);
});

test("Cloudflare deployment applies Phase 3 item isolation before ICAI Worker rollout", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const migration = workflow.indexOf("0027_icai_sync_item_isolation.sql");
  const deploy = workflow.indexOf("- name: Deploy ICAI service");
  assert.ok(migration >= 0, "0027 migration must be applied in retained production D1");
  assert.ok(deploy > migration, "0027 must apply before the ICAI Worker is deployed");
});
