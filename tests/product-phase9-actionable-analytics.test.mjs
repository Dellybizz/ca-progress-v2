import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateBaselineForecast, PHASE9_FORECAST_POLICY } from "../lib/analytics/phase9-policy.mjs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const now = "2026-09-06T12:00:00.000Z";

test("Product Phase 9 withholds forecast without a verified exam date", () => {
  const result = evaluateBaselineForecast({ totalChapters: 10, completedChapters: 4, completionDates: ["2026-08-27", "2026-09-01", "2026-09-05"], verifiedAttemptDate: null, now });
  assert.equal(result.eligible, false);
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.projectedCompletionDate, null);
  assert.ok(result.reasons.some((reason) => /verified exam date/i.test(reason)));
});

test("Product Phase 9 withholds forecast when chapter-completion count is too small", () => {
  const result = evaluateBaselineForecast({ totalChapters: 10, completedChapters: 2, completionDates: ["2026-08-27", "2026-09-05"], verifiedAttemptDate: "2026-11-01", now });
  assert.equal(result.eligible, false);
  assert.equal(result.projectedCompletionDate, null);
  assert.ok(result.reasons.some((reason) => reason.includes(String(PHASE9_FORECAST_POLICY.minimumRecentCompletions))));
  assert.notEqual(result.requiredChaptersPerWeek, null, "deterministic required pace may still be shown from verified attempt + remaining chapters");
});

test("Product Phase 9 requires elapsed observation and multiple completion days", () => {
  const result = evaluateBaselineForecast({ totalChapters: 12, completedChapters: 3, completionDates: ["2026-09-04T09:00:00Z", "2026-09-04T15:00:00Z", "2026-09-05T10:00:00Z"], verifiedAttemptDate: "2026-11-01", now });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((reason) => /at least 7 days/i.test(reason)));
  assert.ok(result.distinctCompletionDays >= 2);
});

test("Product Phase 9 rejects stale recent-pace evidence", () => {
  const result = evaluateBaselineForecast({ totalChapters: 12, completedChapters: 3, completionDates: ["2026-08-10", "2026-08-12", "2026-08-15"], verifiedAttemptDate: "2026-11-01", now });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((reason) => /too stale/i.test(reason)));
});

test("Product Phase 9 produces a deterministic baseline only after evidence gates pass", () => {
  const result = evaluateBaselineForecast({ totalChapters: 12, completedChapters: 4, completionDates: ["2026-08-27", "2026-09-01", "2026-09-05", "2026-09-06"], verifiedAttemptDate: "2026-11-01", now });
  assert.equal(result.eligible, true);
  assert.ok(["ahead", "at_risk", "behind"].includes(result.status));
  assert.ok(result.projectedCompletionDate);
  assert.ok(result.observedChaptersPerWeek > 0);
  assert.ok(result.requiredChaptersPerWeek > 0);
  assert.equal(result.reasons.length, 0);
});

test("Product Phase 9 treats complete First Coverage as deterministic without inventing a pace forecast", () => {
  const result = evaluateBaselineForecast({ totalChapters: 8, completedChapters: 8, completionDates: [], verifiedAttemptDate: null, now });
  assert.equal(result.eligible, true);
  assert.equal(result.status, "complete");
  assert.equal(result.completionPercent, 100);
  assert.equal(result.observedChaptersPerWeek, null);
});

test("Product Phase 9 analytics are derived from canonical student rows and exclude XP from readiness calculations", () => {
  const service = read("lib/analytics/phase9.ts");
  for (const table of ["study_sessions", "study_session_phase3", "chapter_progress", "test_attempts", "revision_due_items", "exam_attempts", "exam_events"]) assert.match(service, new RegExp(table));
  assert.match(service, /First Coverage/);
  assert.match(service, /Revision Readiness/);
  assert.match(service, /Testing Readiness/);
  assert.match(service, /rolling last 7 days/);
  assert.match(service, /Distinct local calendar days/);
  assert.match(service, /No cohort, AI, Mentor, XP or self-rated-understanding score is used to calculate the forecast/);
  assert.doesNotMatch(service, /xp_total|xp_points|user_xp|FROM\s+xp|JOIN\s+xp/i);
  assert.doesNotMatch(service, /@\/lib\/(mentor|thinker)/i);
});

test("Product Phase 9 uses verified attempt dates only and the forecast route exposes insufficient-data behavior", () => {
  const service = read("lib/analytics/phase9.ts");
  const route = read("app/(student)/analytics/forecast/page.tsx");
  assert.match(service, /verification_status='verified'/);
  assert.doesNotMatch(service, /attemptMonthAnchor|attempt_month/);
  assert.match(route, /No personalised completion date is shown yet/);
  assert.match(route, /selected attempt month alone is not enough/i);
  assert.match(route, /Baseline · not Mentor/);
  assert.doesNotMatch(route, /getForecastPageModel/);
});

test("Product Phase 9 keeps every displayed insight explainable and does not start Product Phase 10", () => {
  const component = read("components/analytics/phase9-actionable.tsx");
  const page = read("app/(student)/analytics/page.tsx");
  assert.match(component, /Calculation:/);
  assert.match(component, /What changed this week\?/);
  assert.match(component, /Where is understanding weakest\?/);
  assert.match(component, /Which revision is most overdue\?/);
  assert.match(component, /How consistent am I by subject\?/);
  assert.match(component, /What do my tests say\?/);
  assert.match(component, /Am I on pace for my attempt\?/);
  assert.match(page, /getPhase9AnalyticsModel/);
  assert.doesNotMatch(component, /profile visibility|study buddies|public profile/i);
});
