import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("test archive ships a scoped responsive form layout", () => {
  const globals = read("app/globals.css");
  const css = read("app/styles/product-phase5-tests.css");
  assert.match(globals, /product-phase5-tests\.css/);
  assert.match(css, /\.tests-progress-workspace \.planner-form-grid/);
  assert.match(css, /grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:620px\)/);
});

test("Today ignores malformed historical dates and optional enhancement failures", () => {
  const display = read("lib/smart-planner/today-display.ts");
  const phase8 = read("lib/planner/phase8-today.ts");
  const page = read("app/(student)/planner/today/page.tsx");
  assert.match(display, /if \(!Number\.isFinite\(at\.getTime\(\)\)\) return ""/);
  assert.match(display, /\.filter\(Boolean\)/);
  assert.match(phase8, /getTaskPlanningExtensions[\s\S]*\.catch\(\(\) => new Map\(\)\)/);
  assert.match(page, /getPendingStudyReflectionPrompt\(\)\.catch\(\(\) => null\)/);
  assert.match(page, /getCurrentPhase8Snapshot\(\)\.catch\(\(\) => null\)/);
});

test("Activity filters invalid evidence timestamps and avoids parallel reconciliation", () => {
  const service = read("lib/gamification/service.ts");
  const phase13 = read("lib/gamification/phase13-service.ts");
  const page = read("app/(student)/activity/page.tsx");
  assert.match(service, /function validInstant/);
  assert.match(service, /validInstant\(row\.ended_at\)/);
  assert.match(service, /validInstant\(row\.completed_at\)/);
  assert.doesNotMatch(phase13, /getPhase13UserModel[\s\S]{0,100}reconcileGamification/);
  assert.doesNotMatch(page, /Promise\.all\(\[getGamificationSummary/);
  assert.match(page, /getPhase13UserModel\(user\.id, now, gamification\)/);
});
