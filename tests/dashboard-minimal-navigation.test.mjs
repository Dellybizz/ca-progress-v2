import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("student sidebar exposes Dashboard plus four grouped sections and no account group", () => {
  const navigation = read("components/shell/navigation.tsx");
  for (const label of ["Study", "Progress", "Resources", "Community"]) assert.match(navigation, new RegExp(`label: "${label}"`));
  assert.match(navigation, /sidebar-nav-group__trigger/);
  assert.match(navigation, /aria-expanded=\{expanded\}/);
  assert.doesNotMatch(navigation, /key: "account"|label: "Account"/);
});

test("mobile navigation uses the same five student destinations", () => {
  const mobile = read("components/shell/mobile-nav-placeholder.tsx");
  for (const label of ["Dashboard", "Study", "Progress", "Resources", "Community"]) assert.match(mobile, new RegExp(`label: "${label}"`));
  assert.doesNotMatch(mobile, /More navigation|BottomSheet|label: "Account"/);
});

test("account destinations live in the header profile dropdown", () => {
  const controls = read("components/shell/topbar-controls.tsx");
  assert.match(controls, /className="profile-menu"/);
  for (const route of ["/settings/profile", "/settings", "/pricing", "/billing"]) assert.match(controls, new RegExp(route.replaceAll("/", "\\/")));
});

test("dashboard home is information-first instead of a full analytics surface", () => {
  const dashboard = read("components/dashboard/student-dashboard.tsx");
  assert.match(dashboard, /dashboard-attempt-strip/);
  assert.match(dashboard, /dashboard-home-stats/);
  assert.match(dashboard, /dashboard-home-grid/);
  assert.match(dashboard, /dashboard-icai-compact/);
  assert.doesNotMatch(dashboard, /dashboard-subject-grid|Study status|dashboard-alert-list|smart-dashboard-hero/);
});

test("one compact override layer controls dashboard density", () => {
  const globals = read("app/globals.css");
  const css = read("app/styles/dashboard-clean.css");
  assert.match(globals, /dashboard-clean\.css/);
  assert.doesNotMatch(globals, /dashboard-minimal\.css/);
  assert.match(css, /--sidebar-width: 216px/);
  assert.match(css, /grid-template-columns: 216px minmax\(0, 1fr\)/);
  assert.match(css, /min-height: calc\(58px \+ env\(safe-area-inset-bottom\)\)/);
});
