import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("ICAI admin monitor reports queue, progress, source outcomes and history", () => {
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  const query = read("lib/icai/query.ts");
  assert.match(monitor, /Sync in progress/);
  assert.match(monitor, /sourceProcessed/);
  assert.match(monitor, /sourceResults/);
  assert.match(monitor, /Recent executions/);
  assert.match(query, /background_jobs/);
  assert.match(query, /icai_source_snapshots/);
});

test("manual ICAI sync refuses a duplicate queued or running operation", () => {
  const action = read("app/(admin)/admin/icai-sync/actions.ts");
  assert.match(action, /\["queued", "running"\]/);
  assert.match(action, /already queued or running/);
});

test("active ICAI sync pages refresh without user polling", () => {
  const refresh = read("components/icai/sync-live-refresh.tsx");
  assert.match(refresh, /setInterval\(\(\) => router\.refresh\(\), 3000\)/);
  assert.match(refresh, /clearInterval/);
});
