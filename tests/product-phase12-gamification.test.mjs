import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACHIEVEMENT_DEFINITIONS,
  MAX_SESSION_XP_EVENTS_PER_LOCAL_DAY,
  MAX_TODAY_XP_EVENTS_PER_LOCAL_DAY,
  MEANINGFUL_STUDY_SECONDS,
  PROFESSIONAL_LEVELS,
  XP_RULES,
  achievementKeysForMetrics,
  calculateStreakSummary,
  levelForXp,
  localDateKey,
  qualifiesMeaningfulStudy,
  selectDailyBounded,
  xpEventKey,
  xpForEvent,
} from "../lib/gamification/policy.mjs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 12 XP is bounded per meaningful event and never timer-minute based", () => {
  assert.equal(MEANINGFUL_STUDY_SECONDS, 20 * 60);
  assert.equal(qualifiesMeaningfulStudy({ durationSeconds: MEANINGFUL_STUDY_SECONDS - 1 }), false);
  assert.equal(qualifiesMeaningfulStudy({ durationSeconds: MEANINGFUL_STUDY_SECONDS }), true);
  assert.equal(qualifiesMeaningfulStudy({ completedTodayTasks: 1 }), true);
  for (const [eventType, amount] of Object.entries(XP_RULES)) {
    assert.ok(Number.isInteger(amount) && amount > 0 && amount <= 100, `${eventType} XP must be fixed and bounded`);
  }
  assert.equal(xpForEvent("valid_session"), xpForEvent("valid_session"));
  assert.equal(xpForEvent("unknown"), 0);
});

test("Product Phase 12 repeatable study and Today actions have deterministic daily award caps", () => {
  const sessions = Array.from({ length: 10 }, (_, index) => ({ id: `s${index}`, localDate: "2026-09-07" }));
  const today = Array.from({ length: 12 }, (_, index) => ({ id: `t${index}`, localDate: "2026-09-07" }));
  assert.equal(selectDailyBounded(sessions, MAX_SESSION_XP_EVENTS_PER_LOCAL_DAY).length, MAX_SESSION_XP_EVENTS_PER_LOCAL_DAY);
  assert.equal(selectDailyBounded(today, MAX_TODAY_XP_EVENTS_PER_LOCAL_DAY).length, MAX_TODAY_XP_EVENTS_PER_LOCAL_DAY);
  assert.deepEqual(selectDailyBounded(sessions, 2).map((row) => row.id), ["s0", "s1"]);
});

test("Product Phase 12 XP event keys are deterministic so retries cannot mint a second award", () => {
  assert.equal(xpEventKey("test", "attempt-1"), "test:attempt-1");
  assert.equal(xpEventKey("test", "attempt-1"), xpEventKey("test", "attempt-1"));
  assert.equal(xpEventKey("revision_1", "chapter-1"), "revision_1:chapter-1");
  assert.throws(() => xpEventKey("test", ""));
});

test("Product Phase 12 local date calculation is timezone-safe across midnight and DST", () => {
  const instant = "2026-09-06T20:00:00.000Z";
  assert.equal(localDateKey(instant, "Asia/Kolkata"), "2026-09-07");
  assert.equal(localDateKey(instant, "UTC"), "2026-09-06");
  assert.equal(localDateKey(instant, "America/Los_Angeles"), "2026-09-06");
  const dstInstant = "2026-11-01T08:30:00.000Z";
  assert.equal(localDateKey(dstInstant, "America/Los_Angeles"), "2026-11-01");
  assert.equal(localDateKey(dstInstant, "America/Los_Angeles"), localDateKey(dstInstant, "America/Los_Angeles"));
  assert.equal(localDateKey(instant, "Not/A_Real_Timezone"), "2026-09-07");
});

test("Product Phase 12 streaks are deterministic, allow the current day to remain open, and compute best run", () => {
  const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"];
  assert.deepEqual(calculateStreakSummary(days, "2026-09-06"), { current: 2, best: 3, todayQualified: true });
  assert.deepEqual(calculateStreakSummary(days, "2026-09-07"), { current: 2, best: 3, todayQualified: false });
  assert.deepEqual(calculateStreakSummary([...days, "2026-09-06"], "2026-09-07"), { current: 2, best: 3, todayQualified: false });
});

test("Product Phase 12 levels are professional, monotonic and derived only from total XP", () => {
  assert.ok(PROFESSIONAL_LEVELS.length >= 5);
  for (let index = 1; index < PROFESSIONAL_LEVELS.length; index += 1) assert.ok(PROFESSIONAL_LEVELS[index].minXp > PROFESSIONAL_LEVELS[index - 1].minXp);
  assert.equal(levelForXp(0).name, "Focused Candidate");
  assert.equal(levelForXp(250).name, "Consistent Candidate");
  assert.equal(levelForXp(999999).name, "Distinguished Candidate");
  assert.doesNotMatch(PROFESSIONAL_LEVELS.map((level) => level.name).join(" "), /bronze|silver|gold|diamond|legendary/i);
});

test("Product Phase 12 achievement evaluation is deterministic and unlock conditions do not depend on XP", () => {
  const metrics = { meaningfulSessionCount: 1, studySeconds: 10 * 3600, revisionCount: 25, testCount: 10, bestStreak: 7, syllabusComplete: true };
  const first = achievementKeysForMetrics(metrics);
  const replay = achievementKeysForMetrics(metrics);
  assert.deepEqual(first, replay);
  for (const key of ["first_session", "study_10h", "first_revision", "revision_25", "first_test", "test_10", "streak_7", "syllabus_complete"]) assert.ok(first.includes(key));
  assert.equal(new Set(ACHIEVEMENT_DEFINITIONS.map((achievement) => achievement.key)).size, ACHIEVEMENT_DEFINITIONS.length);
});

test("Product Phase 12 D1 schema enforces replay-safe XP and idempotent achievements without changing academic tables", () => {
  const migration = read("d1/migrations/0022_product_phase12_gamification.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS xp_ledger/);
  assert.match(migration, /UNIQUE\(user_id,event_key\)/);
  assert.match(migration, /CHECK\(xp_amount BETWEEN 1 AND 100\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS study_streak_days/);
  assert.match(migration, /PRIMARY KEY\(user_id,local_date\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_achievements/);
  assert.match(migration, /PRIMARY KEY\(user_id,achievement_key\)/);
  assert.match(migration, /XP ledger entries are immutable/);
  assert.doesNotMatch(migration, /ALTER TABLE\s+(chapter_progress|progress_events|test_stage_records|test_attempts)/i);
  assert.doesNotMatch(migration, /CREATE TABLE[^;]*(leaderboard|referral|anti_cheat|reward_claim)/i);
});

test("Product Phase 12 reconciliation reads canonical academic evidence but writes only gamification tables", () => {
  const service = read("lib/gamification/service.ts");
  assert.match(service, /INSERT OR IGNORE INTO xp_ledger/);
  assert.match(service, /INSERT OR IGNORE INTO study_streak_days/);
  assert.match(service, /INSERT OR IGNORE INTO user_achievements/);
  assert.match(service, /attempt_number=1/);
  assert.match(service, /MAX_SESSION_XP_EVENTS_PER_LOCAL_DAY/);
  assert.match(service, /MAX_TODAY_XP_EVENTS_PER_LOCAL_DAY/);
  assert.match(service, /HAVING COUNT\(\*\)=2/);
  assert.doesNotMatch(service, /(UPDATE|INSERT(?:\s+OR\s+\w+)?\s+INTO|DELETE\s+FROM)\s+(chapter_progress|progress_events|test_stage_records|test_attempts|daily_plan_items|goals|study_sessions)/i);
});

test("Product Phase 12 private API and Activity UI expose motivation metrics without redefining readiness", () => {
  const route = read("app/api/gamification/route.ts");
  const activity = read("app/(student)/activity/page.tsx");
  assert.match(route, /optionalUser/);
  assert.match(route, /getGamificationSummary/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.match(activity, /getGamificationSummary/);
  assert.match(activity, /never change syllabus progress, revision readiness or test readiness/);
  assert.match(activity, /Professional level/);
  assert.match(activity, /Achievements/);
});

test("Product Phase 12 deployment applies and verifies additive migration 0022", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  assert.match(workflow, /0022_product_phase12_gamification\.sql/);
  assert.match(workflow, /'0022'/);
  assert.match(workflow, /phase12_xp_ledger/);
  assert.match(workflow, /phase12_streak_days/);
  assert.match(workflow, /phase12_achievements/);
});

test("Product Phase 13 remains isolated", () => {
  const migration = read("d1/migrations/0022_product_phase12_gamification.sql");
  const service = read("lib/gamification/service.ts");
  const route = read("app/api/gamification/route.ts");
  for (const source of [migration, service, route]) assert.doesNotMatch(source, /monthly leaderboard|referral reward|subscription reward|shareable card|anti-cheat flag/i);
});
