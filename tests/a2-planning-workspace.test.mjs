import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, "utf8");

test("A2 gives every planning route the shared workspace navigation", () => {
  for (const path of ["app/(student)/planner/today/page.tsx", "app/(student)/planner/page.tsx", "app/(student)/calendar/page.tsx", "app/(student)/goals/page.tsx"]) {
    assert.match(read(path), /PlanningNav/);
  }
  const nav = read("components/planner/planning-nav.tsx");
  for (const label of ["Today", "Planner", "Calendar", "Goals"]) assert.match(nav, new RegExp(label));
});

test("A2 uses focused mobile editors and an agenda-first calendar", () => {
  const css = read("app/styles/a2-planning.css");
  assert.match(css, /\.a2-mobile-editor\.is-open/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /phase6-calendar-grid[\s\S]*display: none/);
  assert.match(read("components/planner/planner-client.tsx"), /composerOpen/);
  assert.match(read("components/planner/calendar-client.tsx"), /editorOpen/);
  assert.match(read("components/planner/goals-client.tsx"), /editorOpen/);
});
