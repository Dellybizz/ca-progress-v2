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

test("mobile navigation uses Dashboard directly and opens the other four section menus", () => {
  const mobile = read("components/shell/mobile-nav-placeholder.tsx");
  assert.match(mobile, /<Link (?:prefetch=\\{true\\} )?href="\/dashboard"/);
  for (const label of ["Study", "Progress", "Resources", "Community"]) assert.match(mobile, new RegExp(`label: "${label}"`));
  assert.match(mobile, /BottomSheet/);
  assert.match(mobile, /setOpenSection\(section\.key\)/);
  assert.match(mobile, /mobile-section-menu/);
  assert.match(mobile, /Choose where you want to go/);
  assert.doesNotMatch(mobile, /label: "Account"/);
  for (const route of ["/planner/today", "/planner/revision-settings", "/resources/icai", "/activity"]) {
    assert.match(mobile, new RegExp(route.replaceAll("/", "\\/")));
  }
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

test("attempt strip has a recognizable visual identity without adding dashboard clutter", () => {
  const dashboard = read("components/dashboard/student-dashboard.tsx");
  const character = read("app/styles/dashboard-character.css");
  const globals = read("app/globals.css");
  assert.match(dashboard, /dashboard-attempt-strip dashboard-attempt-card/);
  assert.match(dashboard, /<Icon name="shield"/);
  for (const label of ["Subjects", "Chapters", "Selection"]) assert.match(dashboard, new RegExp(`<span>${label}<\\/span>`));
  assert.match(character, /linear-gradient/);
  assert.match(character, /dashboard-attempt-card__summary strong/);
  assert.match(globals, /dashboard-character\.css/);
  assert.ok(globals.indexOf("dashboard-character.css") > globals.indexOf("dashboard-balanced.css"));
});

test("balanced visual layer restores readable type, full sidebar rows and floating mobile nav", () => {
  const globals = read("app/globals.css");
  const balanced = read("app/styles/dashboard-balanced.css");
  assert.match(globals, /dashboard-balanced\.css/);
  assert.ok(globals.indexOf("dashboard-balanced.css") > globals.indexOf("dashboard-clarity.css"));
  assert.match(balanced, /--sidebar-width: 248px/);
  assert.match(balanced, /sidebar-nav-group__trigger[\s\S]*width: 100%/);
  assert.match(balanced, /font-size: 13px/);
  assert.match(balanced, /dashboard-overview-card__header strong \{ font-size: 14px/);
  assert.match(balanced, /mobile-bottom-nav[\s\S]*border-radius: 20px/);
  assert.match(balanced, /box-shadow: 0 18px 48px/);
});
