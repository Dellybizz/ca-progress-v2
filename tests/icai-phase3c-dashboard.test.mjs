import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 3C keeps the ICAI dashboard operational and progressively disclosed", () => {
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  for (const label of ["Pages checked", "PDFs resolved", "Unavailable pages", "Skipped pages", "Affected rows", "Reviews created", "Reviews suppressed", "Recent runs", "Upcoming schedule"]) {
    assert.match(monitor, new RegExp(label));
  }
  assert.match(monitor, /<details className="icai-disclosure">/);
  assert.match(monitor, /averageLatency/);
  assert.match(monitor, /D1 request counts are not shown/);
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

test("Phase 3C reports the deployed schedule honestly", () => {
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  assert.match(monitor, /Daily · 06:00 IST/);
  assert.match(monitor, /Two-hour source distribution is not enabled/);
});
