import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("ICAI live status endpoint is capability-authenticated and never shared-cacheable", () => {
  const route = read("app/api/admin/icai-sync/status/route.ts");
  assert.match(route, /requireAdminCapability\("icai\.read"\)/);
  assert.match(route, /adminAuthorizationStatus/);
  assert.match(route, /private, no-store/);
  assert.match(route, /getIcaiSyncLiveStatus/);
  assert.match(route, /searchParams\.get\("runId"\)/);
  assert.doesNotMatch(route, /getAdminOperator|operator\.allowed/);
});

test("ICAI status query is compact and excludes heavy dashboard review history", () => {
  const query = read("lib/icai/status-query.ts");
  assert.doesNotMatch(query, /select\("\*"\)/);
  assert.match(query, /RUN_COLUMNS/);
  assert.match(query, /RUNTIME_COLUMNS/);
  assert.match(query, /SNAPSHOT_COLUMNS/);
  assert.match(query, /SOURCE_COLUMNS/);
  assert.match(query, /JOB_COLUMNS/);
  assert.doesNotMatch(query, /icai_review_queue/);
  assert.doesNotMatch(query, /icai_change_events/);
});

test("ICAI live monitor uses adaptive polling and pauses in hidden tabs", () => {
  const monitor = read("components/icai/sync-live-refresh.tsx");
  assert.match(monitor, /5_000/);
  assert.match(monitor, /15_000/);
  assert.match(monitor, /60_000/);
  assert.match(monitor, /visibilityState === "hidden"/);
  assert.match(monitor, /visibilitychange/);
  assert.match(monitor, /cache: "no-store"/);
  assert.match(monitor, /window\.setTimeout/);
  assert.doesNotMatch(monitor, /window\.setInterval/);
  assert.doesNotMatch(monitor, /3000/);
});

test("ICAI live monitor refreshes the full page only after active work ends", () => {
  const monitor = read("components/icai/sync-live-refresh.tsx");
  assert.match(monitor, /if \(!next\.active\)/);
  assert.match(monitor, /refreshed\.current/);
  assert.match(monitor, /router\.refresh\(\)/);
  assert.match(monitor, /Source-by-source status/);
  assert.match(monitor, /Problems requiring attention/);
  assert.match(monitor, /nextScheduledGroup/);
});

test("ICAI admin page no longer claims full-page auto refresh", () => {
  const panel = read("components/icai/admin-sync-monitor.tsx");
  assert.match(panel, /compact live-status feed/);
  assert.match(panel, /5s → 15s adaptive/);
  assert.match(panel, /Live worker state/);
  assert.match(panel, /Skip current source/);
  assert.match(panel, /Cancel run/);
  assert.match(panel, /Recover stalled run/);
  assert.doesNotMatch(panel, /refreshes automatically during a sync/);
});
