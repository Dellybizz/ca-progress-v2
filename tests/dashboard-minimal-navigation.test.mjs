import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("student desktop sidebar keeps Dashboard direct and groups the remaining destinations", () => {
  const navigation = read("components/shell/navigation.tsx");
  for (const label of ["Study", "Progress", "Resources", "Community", "Account"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }
  assert.match(navigation, /sidebar-nav-group__trigger/);
  assert.match(navigation, /aria-expanded=\{expanded\}/);
  assert.match(navigation, /setOpenGroup/);
  assert.match(navigation, /const dashboard = studentNavigation\[0\]/);
});

test("all existing student destinations remain available after grouping", () => {
  const navigation = read("components/shell/navigation.tsx");
  for (const href of [
    "/dashboard", "/planner/today", "/progress", "/study", "/planner",
    "/planner/revision-settings", "/analytics/forecast", "/goals", "/calendar",
    "/activity", "/syllabus", "/updates", "/resources", "/resources/icai",
    "/tests", "/notes", "/community", "/pricing", "/billing", "/settings",
  ]) {
    assert.match(navigation, new RegExp(href.replaceAll("/", "\\/")));
  }
});

test("compact dashboard stylesheet loads after existing phase styles", () => {
  const globals = read("app/globals.css");
  const compact = read("app/styles/dashboard-minimal.css");
  assert.match(globals, /dashboard-minimal\.css/);
  assert.ok(globals.indexOf("dashboard-minimal.css") > globals.indexOf("phase11-lock.css"));
  assert.match(compact, /dashboard-subject-grid[\s\S]*repeat\(3/);
  assert.match(compact, /sidebar-nav--grouped/);
  assert.match(compact, /overflow-y:\s*auto/);
  assert.match(compact, /smart-dashboard-hero h2/);
});
