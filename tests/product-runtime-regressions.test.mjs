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
  assert.match(page, /getPhase8TodayModel\(\)\.catch/);
  assert.match(page, /return getTodayPlanPageModel\(\)/);
  assert.match(page, /getPendingStudyReflectionPrompt\(\)\.catch/);
  assert.match(page, /\[today\] reflection prompt unavailable/);
  assert.match(page, /getCurrentPhase8Snapshot\(\)\.catch/);
  assert.match(page, /\[today\] planning snapshot unavailable/);
  assert.match(page, /Today is running in core mode/);
});

test("Activity filters invalid evidence timestamps and isolates optional gamification from the server render", () => {
  const service = read("lib/gamification/service.ts");
  const phase13 = read("lib/gamification/phase13-service.ts");
  const page = read("app/(student)/activity/page.tsx");
  const client = read("components/gamification/activity-gamification-client.tsx");
  assert.match(service, /function validInstant/);
  assert.match(service, /validInstant\(row\.ended_at\)/);
  assert.match(service, /validInstant\(row\.completed_at\)/);
  assert.doesNotMatch(phase13, /getPhase13UserModel[\s\S]{0,100}reconcileGamification/);
  assert.match(page, /Promise\.allSettled\(\[getActivityPageModel\(\), optionalUser\(\)\]\)/);
  assert.match(page, /ActivityGamificationClient/);
  assert.doesNotMatch(page, /getGamificationSummary|getPhase13UserModel/);
  assert.match(client, /fetch\("\/api\/gamification"/);
  assert.match(client, /fetch\("\/api\/gamification\/phase13"/);
  assert.match(client, /XP summary is temporarily unavailable/);
  assert.match(client, /Leaderboard and referrals are temporarily unavailable/);
});
