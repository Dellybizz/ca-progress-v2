import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 6 stores durable item validators and bounded retry state", () => {
  const migration = read("d1/migrations/0029_icai_sync_incremental_items.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS icai_sync_item_state/);
  for (const field of [
    "etag",
    "last_modified",
    "content_hash",
    "last_checked_at",
    "consecutive_failures",
    "next_retry_at",
    "last_error",
  ])
    assert.match(migration, new RegExp(field));
  assert.match(migration, /PRIMARY KEY\(source_id,item_url\)/);
  assert.match(migration, /idx_icai_sync_item_state_retry/);
});

test("Phase 6 conditionally fetches items and avoids parsing unchanged bodies", () => {
  const isolation = read("workers/icai-sync/item-isolation.ts");
  assert.match(isolation, /If-None-Match/);
  assert.match(isolation, /If-Modified-Since/);
  assert.match(isolation, /response\.status === 304/);
  assert.match(isolation, /fetched\.contentHash === state\?\.content_hash/);
  assert.match(isolation, /stage: "unchanged"/);
  assert.match(isolation, /saveItemSuccess/);
});

test("Phase 6 defers repeated failures with bounded backoff but targeted retry bypasses it", () => {
  const isolation = read("workers/icai-sync/item-isolation.ts");
  assert.match(isolation, /Math\.min\(24, 2 \*\* failures\)/);
  assert.match(isolation, /stage: "retry_deferred"/);
  assert.match(isolation, /!allowedItemUrls[\s\S]*state\?\.next_retry_at/);
  assert.match(isolation, /Boolean\(allowedItemUrls\)/);
});

test("Phase 6 partial incremental payloads cannot become authoritative removals", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /isolated\.unchangedCount === 0/);
  assert.match(engine, /isolated\.deferredCount === 0/);
  assert.match(engine, /item_unchanged_count/);
  assert.match(engine, /item_deferred_count/);
  assert.match(engine, /icai_sync_record_unchanged/);
});

test("Phase 6 exposes incremental savings and deploys its migration before Workers", () => {
  const panel = read("components/icai/sync-live-refresh.tsx");
  const workflow = read(".github/workflows/deploy-staging.yml");
  assert.match(panel, /Incremental savings/);
  assert.match(panel, /unchangedItems/);
  assert.match(panel, /deferredItems/);
  assert.ok(
    workflow.indexOf("0029_icai_sync_incremental_items.sql") <
      workflow.indexOf("Deploy ICAI service"),
  );
});
