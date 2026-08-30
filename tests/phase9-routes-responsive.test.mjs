import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 9 required routes include loading and error states", () => {
  for (const route of ["app/(student)/planner/today","app/(student)/planner/revision-settings","app/(student)/analytics/forecast"]) {
    assert.equal(existsSync(join(root, route, "page.tsx")), true);
    assert.equal(existsSync(join(root, route, "loading.tsx")), true);
    assert.equal(existsSync(join(root, route, "error.tsx")), true);
  }
});

test("Today Plan exposes complete, skip, snooze and reschedule controls plus empty state", () => {
  const ui = read("components/planner/today-plan-client.tsx");
  assert.match(ui, /action: "complete"/);
  assert.match(ui, /action: "skip"/);
  assert.match(ui, /action: "snooze"/);
  assert.match(ui, /action: "reschedule"/);
  assert.match(ui, /Nothing urgent is scheduled today/);
  assert.match(ui, /Regenerate around my changes/);
});

test("Phase 9 surfaces have tablet and mobile responsive breakpoints", () => {
  const css = read("app/styles/phase9.css");
  assert.match(css, /@media\(max-width:1050px\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /phase9-today-layout/);
  assert.match(css, /phase9-forecast-layout/);
});

test("navigation exposes smart planning on desktop and mobile without removing classic Planner", () => {
  const nav = read("components/shell/navigation.tsx");
  const mobile = read("components/shell/mobile-nav-placeholder.tsx");
  assert.match(nav, /Today Plan/);
  assert.match(nav, /href: "\/planner"/);
  assert.match(nav, /Revision Settings/);
  assert.match(nav, /Forecast/);
  assert.match(mobile, /href: "\/planner\/today"/);
});
