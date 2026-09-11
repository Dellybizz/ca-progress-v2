import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 3A live status is capability protected, no-store and scoped to the run's selected sources", () => {
  const route = read("app/api/admin/icai-sync/status/route.ts");
  const query = read("lib/icai/status-query.ts");
  const live = read("components/icai/sync-live-refresh.tsx");
  assert.match(route, /requireAdminCapability\("icai\.read"\)/);
  assert.match(route, /private, no-store/);
  assert.match(query, /error_summary,details/);
  assert.match(query, /selectedRunSourceIds/);
  assert.match(query, /details\.source_ids/);
  assert.match(query, /visibleSources = selectedSourceIds\.size/);
  assert.match(query, /ICAI_STALL_THRESHOLD_MS/);
  assert.match(query, /nextRetryAt/);
  assert.match(query, /nextDailySync/);
  assert.match(live, /Overall progress/);
  assert.match(live, /Heartbeat/);
  assert.match(live, /runtime\?\.currentSourceName/);
  assert.match(live, /runtime\.batchNumber/);
  assert.match(live, /runtime\.processedItems/);
  assert.match(live, /Next retry/);
});

test("Phase 3B operator controls are capability checked, audited, recoverable and use Queue jobs for sync execution", () => {
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  assert.match(actions, /requireAdminCapability\("icai\.run"\)/);
  assert.match(actions, /recordAdminAuditEvent/);
  assert.match(actions, /jobKey\("icai-sync", "targeted"/);
  assert.match(actions, /intent === "pause"/);
  assert.match(actions, /intent === "resume"/);
  assert.match(actions, /intent === "cancel"/);
  assert.match(actions, /intent === "recover"/);
  assert.match(actions, /skipIcaiItemAction/);
  assert.match(actions, /restoreIcaiItemAction/);
  assert.match(actions, /excludeIcaiSourceAction/);
  assert.match(actions, /restoreIcaiSourceAction/);
  assert.match(actions, /excluded_until: null, exclusion_reason: null/);
  assert.match(actions, /icai\.sync\.restore_source/);
  assert.match(monitor, /Run source/);
  assert.match(monitor, /Force recheck/);
  assert.match(monitor, /Retry failed source/);
  assert.match(monitor, /Exclude 24h/);
  assert.match(monitor, /Restore source/);
  assert.doesNotMatch(monitor, />Retry failed batch</);
});

test("Phase 3C keeps the main ICAI admin page operational and progressively discloses secondary controls", () => {
  const page = read("app/(admin)/admin/icai-sync/page.tsx");
  const monitor = read("components/icai/admin-sync-monitor.tsx");
  assert.match(page, /requireAdminPageCapability\("icai\.read"\)/);
  assert.match(monitor, /ICAI sync operations/);
  assert.match(monitor, /SyncLiveRefresh/);
  assert.match(monitor, /href="\/admin\/icai-sync\/data"/);
  assert.match(monitor, /<summary>Source & file recovery<\/summary>/);
  assert.match(monitor, /<summary>Recent run history<\/summary>/);
  assert.match(monitor, /Review queue/);
  assert.doesNotMatch(monitor, /decideIcaiReviewAction/);
  assert.doesNotMatch(monitor, />Approve</);
  assert.doesNotMatch(monitor, />Reject</);
  assert.doesNotMatch(monitor, /Upcoming schedule/);
});

test("Phase 3D separates verified student-facing content and review work with complete filters and official evidence", () => {
  const page = read("app/(admin)/admin/icai-sync/data/page.tsx");
  const data = read("components/icai/admin-sync-data.tsx");
  const actions = read("app/(admin)/admin/icai-sync/actions.ts");
  assert.match(page, /requireAdminPageCapability\("icai\.read"\)/);
  assert.match(page, /type: param\(params\.type\)/);
  assert.match(data, /ICAI_RESOURCE_TYPES/);
  assert.match(data, /name="level"/);
  assert.match(data, /name="attempt"/);
  assert.match(data, /name="subject"/);
  assert.match(data, /name="type"/);
  assert.match(data, /Approval queue/);
  assert.match(data, />\s*Approve\s*</);
  assert.match(data, />\s*Reject\s*</);
  assert.match(data, /Open ICAI PDF|Open PDF/);
  assert.match(data, /Exam dates and countdown sources/);
  assert.match(data, /Possible duplicate groups/);
  assert.match(data, /Official source evidence and availability/);
  assert.doesNotMatch(data, /runTargetedIcaiSyncAction/);
  assert.doesNotMatch(data, /controlIcaiSyncAction/);
  assert.match(actions, /requireAdminCapability\("icai\.review"\)/);
  assert.match(actions, /invalidateSharedPublicCache\(\["icai"\]\)/);
});
