import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("student sidebar keeps the core study flow visible and secondary areas grouped", () => {
  const navigation = read("components/shell/navigation.tsx");
  for (const label of ["Dashboard", "Today Plan", "Study", "Progress", "Planner"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }
  for (const label of ["Study tools", "Library", "Community", "Account"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }
  assert.match(navigation, /studentPrimaryNavigation/);
  assert.match(navigation, /sidebar-nav-group__trigger/);
  assert.match(navigation, /aria-expanded=\{expanded\}/);
  for (const route of ["/analytics", "/study-buddy", "/pricing", "/billing", "/settings"]) {
    assert.match(navigation, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("mobile navigation exposes the core flow directly and keeps secondary destinations under More", () => {
  const mobile = read("components/shell/mobile-navigation.tsx");
  assert.equal(existsSync(join(root, "components/shell/mobile-nav-placeholder.tsx")), false);
  for (const label of ["Home", "Today", "Study", "Progress", "More"]) {
    assert.ok(mobile.includes(`<span>${label}</span>`), `Missing primary mobile item: ${label}`);
  }
  assert.match(mobile, /BottomSheet/);
  assert.match(mobile, /studentMoreGroups/);
  assert.match(mobile, /aria-label="Open more navigation"/);
  for (const route of ["/planner", "/planner/revision-settings", "/analytics", "/resources/icai", "/study-buddy", "/activity", "/settings"]) {
    assert.match(mobile, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("account destinations also remain available from the header profile dropdown", () => {
  const controls = read("components/shell/topbar-controls.tsx");
  assert.match(controls, /className="profile-menu"/);
  for (const route of ["/settings/profile", "/settings", "/pricing", "/billing"]) {
    assert.match(controls, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("dashboard overview uses instantly recognizable Today Study and Progress widgets", () => {
  const dashboard = read("components/dashboard/student-dashboard.tsx");
  assert.match(dashboard, /dashboard-a1-focus/);
  assert.match(dashboard, /dashboard-a1-pulse/);
  assert.match(dashboard, /dashboard-a1-continue/);
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

test("attempt strip has a recognizable visual identity without adding dashboard clutter", () => {
  const dashboard = read("components/dashboard/student-dashboard.tsx");
  const character = read("app/styles/dashboard-a1.css");
  const globals = read("app/globals.css");
  assert.match(dashboard, /dashboard-a1-exam/);
  assert.match(dashboard, /"shield"/);
  for (const label of ["Syllabus completed", "Studied this week", "Current streak"]) {
    assert.match(dashboard, new RegExp(label));
  }
  assert.match(character, /dashboard-a1-exam__status strong/);
  assert.match(character, /grid-template-areas:"focus" "exam" "continue" "pulse" "update" "actions" "leaderboard"/);
  assert.match(globals, /dashboard-a1\.css/);
  assert.doesNotMatch(globals, /dashboard-(clean|clarity|balanced|character)\.css/);
});

test("legacy dashboard styling cannot override the canonical application shell", () => {
  const globals = read("app/globals.css");
  const shell = read("app/styles/shell.css");
  assert.match(globals, /dashboard-a1\.css/);
  assert.match(globals, /shell\.css/);
  assert.ok(globals.indexOf("shell.css") > globals.indexOf("dashboard-a1.css"));
  assert.match(shell, /\.mobile-bottom-nav\s*\{/);
  assert.match(shell, /border-top:\s*1px solid var\(--color-border\)/);
  assert.match(shell, /box-shadow:\s*none/);
});

test("desktop navigation scrolls independently without colliding with account identity", () => {
  const shell = read("app/styles/shell.css");
  assert.match(shell, /\.shell-navigation\s*\{[^}]*flex:\s*1 1 auto[^}]*overflow-y:\s*auto/s);
  assert.match(shell, /\.shell-navigation\s*\{[^}]*align-content:\s*start[^}]*grid-auto-rows:\s*max-content/s);
  assert.match(shell, /\.app-shell--r3 \.desktop-sidebar\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(shell, /\.shell-identity\s*\{[^}]*flex:\s*0 0 auto[^}]*min-height:\s*54px/s);
});
