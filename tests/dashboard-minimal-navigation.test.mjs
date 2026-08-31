import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("student sidebar restores Dashboard plus five grouped sections", () => {
  const navigation = read("components/shell/navigation.tsx");
  for (const label of ["Study", "Progress", "Resources", "Community", "Account"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }
  assert.match(navigation, /sidebar-nav-group__trigger/);
  assert.match(navigation, /aria-expanded=\{expanded\}/);
  for (const route of ["/pricing", "/billing", "/settings"]) assert.match(navigation, new RegExp(route.replaceAll("/", "\\/")));
});

test("mobile navigation remains the five core student destinations", () => {
  const mobile = read("components/shell/mobile-nav-placeholder.tsx");
  for (const label of ["Dashboard", "Study", "Progress", "Resources", "Community"]) assert.match(mobile, new RegExp(`label: "${label}"`));
  assert.doesNotMatch(mobile, /More navigation|BottomSheet|label: "Account"/);
});

test("account destinations also remain available from the header profile dropdown", () => {
  const controls = read("components/shell/topbar-controls.tsx");
  assert.match(controls, /className="profile-menu"/);
  for (const route of ["/settings/profile", "/settings", "/pricing", "/billing"]) assert.match(controls, new RegExp(route.replaceAll("/", "\\/")));
});

test("dashboard overview uses instantly recognizable Today Study and Progress widgets", () => {
  const dashboard = read("components/dashboard/student-dashboard.tsx");
  assert.match(dashboard, /dashboard-overview-grid/);
  assert.match(dashboard, /function TodayOverview/);
  assert.match(dashboard, /function StudyOverview/);
  assert.match(dashboard, /function ProgressOverview/);
  assert.match(dashboard, /model\.today\.revisions/);
  assert.match(dashboard, /model\.today\.tests/);
  assert.match(dashboard, /model\.study\.weeklyTargetMinutes/);
  assert.match(dashboard, /model\.study\.streakDays/);
  assert.match(dashboard, /model\.progress\.groups\.slice\(0, 2\)/);
  assert.doesNotMatch(dashboard, /dashboard-home-stats/);
});

test("clarity layer restores comfortable sidebar width after compact base styles", () => {
  const globals = read("app/globals.css");
  const clarity = read("app/styles/dashboard-clarity.css");
  assert.match(globals, /dashboard-clarity\.css/);
  assert.ok(globals.indexOf("dashboard-clarity.css") > globals.indexOf("dashboard-clean.css"));
  assert.match(clarity, /--sidebar-width: 248px/);
  assert.match(clarity, /grid-template-columns: 248px minmax\(0, 1fr\)/);
  assert.match(clarity, /dashboard-overview-progress/);
});
