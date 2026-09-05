import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 6 promotes dashboard task and study slots to real normalized data", () => {
  const service = read("lib/dashboard/service.ts");
  const ui = read("components/dashboard/student-dashboard.tsx");
  assert.match(service, /getPlannerDashboardSummary/);
  assert.match(service, /getStudyAnalytics/);
  assert.match(service, /status: "tracked"/);
  assert.match(ui, /model\.today\.tasks/);
  assert.match(ui, /model\.study\.studiedThisWeekMinutes/);
  assert.match(ui, /model\.study\.streakDays/);
  assert.doesNotMatch(ui, /Study streak is not tracked yet|Studied this week <strong>Not tracked yet/);
});

test("finishing a timer immediately feeds analytics from study_sessions", () => {
  const timerSql = read("supabase/migrations/20260830130000_phase6_study_planner_calendar.sql");
  const studyService = read("lib/study/service.ts");
  const analyticsPage = read("app/(student)/analytics/page.tsx");
  assert.match(timerSql, /insert into public\.study_sessions/);
  assert.match(studyService, /getHotStudySessions/);
  assert.match(studyService, /getHotStudySessions\(userId, since\)/);
  assert.match(analyticsPage, /getStudyPageModel/);
  assert.match(analyticsPage, /Recent study sessions/);
  assert.match(analyticsPage, /No manual studyHours array/);
});

test("Phase 9 smart recommendation boundary remains intact", () => {
  const dashboard = read("lib/dashboard/service.ts");
  const migration = read("supabase/migrations/20260830130000_phase6_study_planner_calendar.sql");
  assert.match(dashboard, /status: "contextual_fallback"/);
  assert.match(dashboard, /phase9Ready: true/);
  assert.doesNotMatch(migration, /create table public\.(revision_schedule|planner_recommendations|recommendations)/);
});
