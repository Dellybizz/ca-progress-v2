import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { localDateKey } from "../lib/gamification/policy.mjs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 12 Today streak evidence uses actual completion time, not a backdated schedule date", () => {
  const service = read("lib/gamification/service.ts");
  assert.match(service, /localDateKey\(row\.completed_at, row\.timezone\)/);
  assert.doesNotMatch(service, /row\.scheduled_for\.slice\(0, 10\)/);
  assert.match(service, /i\.status='completed'/);
});

test("Product Phase 12 reflection and resolved-doubt XP require a meaningful linked study session and are daily bounded", () => {
  const service = read("lib/gamification/service.ts");
  assert.match(service, /JOIN study_sessions s ON s\.id=phase\.session_id AND s\.user_id=phase\.user_id/);
  assert.match(service, /phase\.reflection_saved_at IS NOT NULL AND s\.duration_seconds>=\?2/);
  assert.match(service, /JOIN study_sessions s ON s\.id=d\.session_id AND s\.user_id=d\.user_id/);
  assert.match(service, /d\.resolved_at IS NOT NULL AND s\.duration_seconds>=\?2/);
  assert.match(service, /MAX_REFLECTION_XP_EVENTS_PER_LOCAL_DAY = 3/);
  assert.match(service, /MAX_RESOLVED_DOUBT_XP_EVENTS_PER_LOCAL_DAY = 3/);
  assert.match(service, /selectDailyBounded\(reflectionDays, MAX_REFLECTION_XP_EVENTS_PER_LOCAL_DAY\)/);
  assert.match(service, /selectDailyBounded\(doubtDays, MAX_RESOLVED_DOUBT_XP_EVENTS_PER_LOCAL_DAY\)/);
});

test("Product Phase 12 daily and weekly study-goal XP cannot be farmed with duplicate same-period goals", () => {
  const service = read("lib/gamification/service.ts");
  assert.match(service, /MAX_DAILY_GOAL_XP_EVENTS_PER_LOCAL_DAY = 1/);
  assert.match(service, /MAX_WEEKLY_GOAL_XP_EVENTS_PER_LOCAL_WEEK = 1/);
  assert.match(service, /selectDailyBounded\(dailyGoalDays, MAX_DAILY_GOAL_XP_EVENTS_PER_LOCAL_DAY\)/);
  assert.match(service, /selectWeeklyBounded\(weeklyGoalDays, MAX_WEEKLY_GOAL_XP_EVENTS_PER_LOCAL_WEEK\)/);
  assert.match(service, /weekStart: localWeekStartKey\(item\.localDate\)/);
});

test("Product Phase 12 Study Together bonus requires two completed meaningful canonical sessions", () => {
  const service = read("lib/gamification/service.ts");
  assert.match(service, /JOIN study_sessions mine_session ON mine_session\.id=mine\.canonical_study_session_id/);
  assert.match(service, /JOIN study_sessions participant_session ON participant_session\.id=p\.canonical_study_session_id/);
  assert.match(service, /mine_session\.duration_seconds>=\?2 AND participant_session\.duration_seconds>=\?2/);
  assert.match(service, /HAVING COUNT\(\*\)=2/);
  assert.match(service, /SUM\(CASE WHEN p\.completed_at IS NOT NULL THEN 1 ELSE 0 END\)=2/);
});

test("Product Phase 12 timezone boundaries derive local days from the event timezone", () => {
  assert.equal(localDateKey("2026-09-06T18:29:59.000Z", "Asia/Kolkata"), "2026-09-06");
  assert.equal(localDateKey("2026-09-06T18:30:00.000Z", "Asia/Kolkata"), "2026-09-07");
  assert.equal(localDateKey("2026-03-08T09:59:59.000Z", "America/Los_Angeles"), "2026-03-08");
  assert.equal(localDateKey("2026-03-08T10:00:00.000Z", "America/Los_Angeles"), "2026-03-08");
});

test("Product Phase 12 streak evidence is append-only and Phase 13 remains out of scope", () => {
  const migration = read("d1/migrations/0022_product_phase12_gamification.sql");
  const service = read("lib/gamification/service.ts");
  assert.match(migration, /trg_phase12_streak_day_no_update/);
  assert.match(migration, /Streak evidence is immutable/);
  assert.match(migration, /trg_phase12_streak_day_no_delete/);
  assert.match(migration, /Streak evidence is append-only/);
  for (const source of [migration, service]) {
    assert.doesNotMatch(source, /leaderboard|referral|reward_claim|shareable_card|anti_cheat/i);
  }
});
