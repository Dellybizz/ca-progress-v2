import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("dashboard copy is student-facing rather than implementation-facing", () => {
  const dashboard = read("components/dashboard/student-dashboard.tsx");
  const service = read("lib/dashboard/service.ts");
  const visibleCopy = `${dashboard}\n${service}`;

  assert.doesNotMatch(visibleCopy, /Phase [0-9]/);
  assert.doesNotMatch(visibleCopy, /server-side|normalized .* rows|deterministic fallback|future owner|data-backed/i);
  assert.match(dashboard, /Here’s your study snapshot for today/);
  assert.match(dashboard, /Countdown coming soon/);
  assert.match(dashboard, /Study status/);
  assert.match(dashboard, /Suggested/);
});

test("dashboard visual CSS keeps secondary content readable", () => {
  const css = read("app/styles/student-dashboard.css");

  assert.match(css, /dashboard-future-metric small[\s\S]*font-size:\s*10px/);
  assert.match(css, /dashboard-recommendation-card p[\s\S]*font-size:\s*11px/);
  assert.match(css, /dashboard-alert-item p[\s\S]*font-size:\s*10px/);
  assert.match(css, /smart-dashboard-hero h2[\s\S]*clamp\(36px, 4vw, 56px\)/);
});

test("dashboard progress and status cards no longer render phase badges", () => {
  const dashboard = read("components/dashboard/student-dashboard.tsx");

  assert.doesNotMatch(dashboard, /Phase 9 ready/);
  assert.doesNotMatch(dashboard, /Phase \{alert\.phase\}/);
  assert.match(dashboard, /Overall progress/);
  assert.match(dashboard, /Latest ICAI changes/);
});
