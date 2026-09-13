import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 3E stores durable bounded lifecycle diagnostics for every nested ICAI page", () => {
  const migration = read("d1/migrations/0038_icai_phase3ef_item_isolation.sql");
  const isolation = read("workers/icai-sync/item-isolation.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_sync_items/);
  for (const field of ["duration_ms", "bytes_fetched", "parsed_count", "failure_category", "retry_eligible"]) assert.match(migration, new RegExp(field));
  assert.match(migration, /UNIQUE\(run_id,source_id,item_url\)/);
  assert.match(migration, /current_item_id/);
  assert.match(isolation, /beginIcaiItemExecution/);
  assert.match(isolation, /finishIcaiItemExecution/);
  assert.match(isolation, /attempts=MIN\(icai_sync_items\.attempts\+1,20\)/);
});

test("Phase 3E isolates nested fetch and parse failures without aborting the source", () => {
  const resolver = read("workers/icai-sync/direct-resource-resolver.ts");
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(resolver, /onItemResult/);
  assert.match(resolver, /status: timedOut \? "timed_out" : "failed"/);
  assert.match(resolver, /failureCategory: "not_found"/);
  assert.match(resolver, /failureCategory: "parse_error"/);
  assert.match(resolver, /status: "succeeded"/);
  assert.match(engine, /beginIcaiItemExecution/);
  assert.match(engine, /finishIcaiItemExecution/);
  assert.match(engine, /incomplete_nested_traversal: true/);
  assert.match(engine, /preserved_existing_resources/);
});

test("Phase 3F retries exact, failed, or timed-out items through affected-source Queue rescans", () => {
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  const service = read("workers/icai-sync/index.ts");
  const worker = read("custom-worker.ts");
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(actions, /retryIcaiItemsAction/);
  assert.match(actions, /\["one", "failed", "timed_out"\]/);
  assert.match(actions, /requestedSourceIds: sourceIds/);
  assert.match(actions, /retryItemUrls/);
  assert.match(actions, /forceRecheck: true/);
  assert.match(actions, /jobKey\("icai-sync", "item-retry"/);
  assert.match(service, /retryItemUrls/);
  assert.match(worker, /retryItemUrls: job\.payload\.retryItemUrls/);
  assert.match(engine, /retry_item_urls/);
  assert.match(engine, /for \(const retryUrl of retryItemUrls\) skippedUrls\.delete\(retryUrl\)/);
});

test("Phase 3F item exclusions are reversible and reuse the canonical Phase 2A skip table", () => {
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  assert.match(actions, /excludeIcaiDiagnosticItemAction/);
  assert.match(actions, /icai_sync_item_skips/);
  assert.match(actions, /24 \* 60 \* 60 \* 1000/);
  assert.match(actions, /icai\.sync\.exclude_item/);
  assert.match(actions, /reversible: true/);
  assert.match(actions, /restoreIcaiItemAction/);
  assert.match(monitor, /Retry failed items/);
  assert.match(monitor, /Retry timed-out items/);
  assert.match(monitor, /Retry item/);
  assert.match(monitor, /Exclude 24h/);
  assert.match(monitor, /Exclude until restored/);
});

test("Phase 3E/3F are permanent retained-D1 and focused ICAI regression gates", () => {
  const retained = read("scripts/apply-retained-d1-migrations.mjs");
  const validator = read("scripts/validate-d1-hot-indexes.mjs");
  const pkg = JSON.parse(read("package.json"));
  assert.match(retained, /0038_icai_phase3ef_item_isolation\.sql/);
  assert.match(retained, /BETWEEN '0012' AND '0047'/);
  assert.match(validator, /0038_icai_phase3ef_item_isolation\.sql/);
  assert.match(validator, /icai_sync_items/);
  assert.match(pkg.scripts["test:icai:phase5"], /icai-phase3ef-item-isolation\.test\.mjs/);
});
