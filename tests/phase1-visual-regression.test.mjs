import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("desktop sidebar scrolls internally instead of overflowing the viewport", () => {
  const globals = read("app/globals.css");
  const qa = read("app/styles/phase1-qa.css");
  assert.match(globals, /phase1-qa\.css/);
  assert.match(qa, /desktop-sidebar \.sidebar-nav/);
  assert.match(qa, /overflow-y:\s*auto/);
  assert.match(qa, /min-height:\s*0/);
});

test("workspace search is a compact responsive command palette", () => {
  const controls = read("components/shell/topbar-controls.tsx");
  const qa = read("app/styles/phase1-qa.css");
  assert.match(controls, /command-palette/);
  assert.match(controls, /Search pages and tools/);
  assert.match(controls, /ArrowDown/);
  assert.match(controls, /router\.push/);
  assert.doesNotMatch(controls, /Global data search remains assigned to a later phase/);
  assert.match(qa, /width:\s*min\(680px, 100%\)/);
  assert.match(qa, /@media \(max-width: 699px\)/);
  assert.match(qa, /height:\s*100dvh/);
});

test("student-facing review surfaces do not expose implementation-roadmap copy", () => {
  const surfaces = [
    read("app/(student)/settings/page.tsx"),
    read("components/auth/profile-form.tsx"),
    read("app/(student)/planner/page.tsx"),
    read("components/planner/planner-client.tsx"),
    read("app/(student)/notes/page.tsx"),
    read("components/shell/topbar-controls.tsx"),
  ].join("\n");
  assert.doesNotMatch(surfaces, /Phase [13679]/);
  assert.doesNotMatch(surfaces, /database RLS/);
  assert.doesNotMatch(surfaces, /assigned to a later phase/);
  assert.doesNotMatch(surfaces, /Design preview/);
});

test("clean student shell keeps admin operations out of normal navigation", () => {
  const shell = read("components/shell/app-shell.tsx");
  assert.match(shell, /<TopbarControls viewer=\{viewer\} area=\{area\}/);
  assert.doesNotMatch(shell, /Admin preview|Admin operations|getAdminOperator|ADMIN_OPS_SERVICE/);
  assert.match(shell, /area === "admin" \? <Link className="sidebar-switch" href="\/dashboard"/);
});
