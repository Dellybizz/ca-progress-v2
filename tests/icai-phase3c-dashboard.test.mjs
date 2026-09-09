import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 3C keeps the ICAI dashboard operational and progressively disclosed", () => {
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  assert.match(monitor, /ICAI sync operations/i);
  assert.match(monitor, /SyncLiveRefresh/);
  assert.match(monitor, /Review queue/);
  assert.match(monitor, /Source & file recovery/);
  assert.match(monitor, /Recent run history/);
  assert.match(monitor, /<details/);
  assert.match(monitor, /averageLatency/);
  assert.match(monitor, /D1 request counts are not shown/);
  assert.doesNotMatch(monitor, /Upcoming schedule/);
  assert.doesNotMatch(monitor, />Approve</);
  assert.doesNotMatch(monitor, />Reject</);
});

test("Phase 3C metrics reuse durable source-state counters", () => {
  const query = read("lib/icai/query.ts");
  const liveQuery = read("lib/icai/status-query.ts");
  const liveMonitor = read("components/icai/sync-live-refresh.tsx");
  const types = read("lib/icai/types.ts");
  assert.match(query, /cursor_offset,cursor_total,resolved_count,dropped_count,unavailable_count/);
  assert.match(query, /sourceMetrics/);
  assert.match(query, /operationalMetrics/);
  assert.match(types, /pagesChecked: number/);
  assert.match(types, /pdfsResolved: number/);
  assert.match(liveQuery, /resolved_count,dropped_count,unavailable_count/);
  assert.match(liveMonitor, /Live performance metrics/);
  assert.match(liveMonitor, /liveMetrics/);
});

test("Phase 3C reports schedule in the live runtime model instead of duplicating a dashboard panel", () => {
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  const live = read("components/icai/sync-live-refresh.tsx");
  const status = read("lib/icai/status-query.ts");
  assert.doesNotMatch(monitor, /Upcoming schedule/);
  assert.match(live, /nextScheduledGroup|nextDailySync/);
  assert.match(status, /nextDailySync/);
});
