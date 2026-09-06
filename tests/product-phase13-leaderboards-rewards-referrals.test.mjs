import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IMPOSSIBLE_SESSION_SECONDS,
  LEADERBOARD_CATEGORIES,
  REFERRAL_ACTIVATION_SESSION_COUNT,
  REFERRAL_ACTIVATION_XP,
  detectExcessiveDailyXp,
  detectFakeTestPattern,
  detectProgressLoop,
  detectRapidChapterCompletion,
  detectSessionSignals,
  monthWindow,
  nextMonthRewardWindow,
  normalizeLeaderboardCategory,
  publicLeaderboardEntry,
  publicShareCard,
  referralActivationState,
  rewardForRank,
  sanitizePublicAlias,
} from "../lib/gamification/phase13-policy.mjs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 13 launches only the planned leaderboard categories and defaults unknown input to overall", () => {
  assert.deepEqual([...LEADERBOARD_CATEGORIES], ["overall", "foundation", "intermediate", "final"]);
  assert.equal(normalizeLeaderboardCategory("Foundation"), "foundation");
  assert.equal(normalizeLeaderboardCategory("study"), "overall");
  assert.equal(normalizeLeaderboardCategory("improvement"), "overall");
});

test("Product Phase 13 public aliases and leaderboard entries are strict privacy whitelists", () => {
  assert.equal(sanitizePublicAlias("  Candidate 42  "), "Candidate 42");
  assert.equal(sanitizePublicAlias("me@example.com https://example.com"), "CA Candidate");
  const publicEntry = publicLeaderboardEntry({ rank: 2, displayName: "User\nme@example.com", totalXp: 1234, levelName: "Advanced Candidate", userId: "private-user", email: "private@example.com" });
  assert.deepEqual(Object.keys(publicEntry).sort(), ["displayName", "levelName", "rank", "totalXp"]);
  assert.doesNotMatch(JSON.stringify(publicEntry), /private-user|private@example\.com|me@example\.com/);
});

test("Product Phase 13 monthly rewards are rank-bounded and last exactly the following UTC month", () => {
  assert.deepEqual(rewardForRank(1), { rank: 1, rewardTier: "premium", label: "Premium" });
  assert.deepEqual(rewardForRank(2), { rank: 2, rewardTier: "pro", label: "Pro" });
  assert.deepEqual(rewardForRank(3), { rank: 3, rewardTier: "pro", label: "Pro" });
  assert.equal(rewardForRank(4), null);
  assert.equal(rewardForRank(0), null);
  assert.deepEqual(monthWindow("2026-08"), { periodKey: "2026-08", startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-09-01T00:00:00.000Z" });
  assert.deepEqual(nextMonthRewardWindow("2026-12"), { competitionPeriod: "2026-12", rewardPeriod: "2027-01", startsAt: "2027-01-01T00:00:00.000Z", endsAt: "2027-02-01T00:00:00.000Z" });
});

test("Product Phase 13 referrals require three distinct sane meaningful sessions and award a fixed activation bonus", () => {
  assert.equal(REFERRAL_ACTIVATION_SESSION_COUNT, 3);
  assert.equal(REFERRAL_ACTIVATION_XP, 200);
  const rows = [
    { id: "one", duration_seconds: 1200 },
    { id: "two", duration_seconds: 1800 },
    { id: "three", duration_seconds: 2400 },
  ];
  assert.deepEqual(referralActivationState(rows), { qualifyingCount: 3, activated: true });
  assert.deepEqual(referralActivationState([...rows.slice(0, 2), { id: "short", duration_seconds: 1199 }]), { qualifyingCount: 2, activated: false });
  assert.deepEqual(referralActivationState([...rows.slice(0, 2), { id: "impossible", duration_seconds: IMPOSSIBLE_SESSION_SECONDS }]), { qualifyingCount: 2, activated: false });
  assert.deepEqual(referralActivationState([rows[0], rows[0], rows[1], rows[2]]), { qualifyingCount: 3, activated: true });
});

test("Product Phase 13 anti-cheat policy identifies impossible and simultaneous study sessions", () => {
  const signals = detectSessionSignals([
    { id: "a", duration_seconds: IMPOSSIBLE_SESSION_SECONDS, started_at: "2026-09-01T00:00:00Z", ended_at: "2026-09-01T15:00:00Z" },
    { id: "b", duration_seconds: IMPOSSIBLE_SESSION_SECONDS + 1, started_at: "2026-09-01T14:00:00Z", ended_at: "2026-09-02T05:00:01Z" },
  ]);
  assert.deepEqual(signals.impossibleSessionIds, ["a", "b"]);
  assert.equal(signals.repeatedImpossible, true);
  assert.equal(signals.simultaneous, true);
  assert.equal(signals.overlappingPairs.length, 1);
});

test("Product Phase 13 anti-cheat policy detects rapid progress, fake tests, re-entry loops and excessive XP", () => {
  const progress = Array.from({ length: 5 }, (_, index) => ({ chapter_id: `c${index}`, completed_at: `2026-09-01T00:0${index}:00Z` }));
  assert.equal(detectRapidChapterCompletion(progress).suspicious, true);
  const tests = Array.from({ length: 5 }, (_, index) => ({ id: `t${index}`, completed_at: `2026-09-01T00:0${index}:00Z`, duration_minutes: 1 }));
  assert.equal(detectFakeTestPattern(tests).suspicious, true);
  const loop = ["set", "clear", "set", "clear", "set"].map((action, index) => ({ chapter_id: "c1", stage: "completed", action, created_at: `2026-09-01T0${index}:00:00Z` }));
  assert.equal(detectProgressLoop(loop).suspicious, true);
  assert.equal(detectExcessiveDailyXp([{ occurred_at: "2026-09-01T01:00:00Z", xp_amount: 500 }, { occurred_at: "2026-09-01T02:00:00Z", xp_amount: 300 }]).suspicious, true);
});

test("Product Phase 13 share cards whitelist only voluntary summary fields", () => {
  const card = publicShareCard({ kind: "weekly", title: "Weekly", primary: "120 XP", secondary: "60 minutes", userId: "secret", email: "secret@example.com", sessions: [{ id: "private" }] });
  assert.deepEqual(Object.keys(card).sort(), ["kind", "primary", "secondary", "title"]);
  assert.doesNotMatch(JSON.stringify(card), /secret|private/);
});

test("Product Phase 13 schema makes opt-in private-by-default and reward/referral grants replay-safe", () => {
  const migration = read("d1/migrations/0023_product_phase13_leaderboards_rewards_referrals.sql");
  assert.match(migration, /leaderboard_profiles/);
  assert.match(migration, /opted_in INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /UNIQUE\(user_id,event_key\)/);
  assert.match(migration, /CHECK\(referrer_user_id <> referred_user_id\)/);
  assert.match(migration, /UNIQUE\(competition_period,user_id\)/);
  assert.match(migration, /UNIQUE\(competition_period,rank\)/);
  assert.match(migration, /Gamification bonus ledger entries are append-only/);
  assert.match(migration, /Anti-cheat review evidence cannot be deleted/);
  assert.doesNotMatch(migration, /ALTER TABLE\s+(chapter_progress|progress_events|test_attempts|study_sessions)/i);
});

test("Product Phase 13 subscription rewards overlay existing plan definitions without creating Phase 15 pricing", () => {
  const service = read("lib/gamification/phase13-service.ts");
  const billing = read("lib/billing/service.ts");
  assert.match(service, /subscription_plans/);
  assert.match(service, /reward_tier/);
  assert.match(service, /starts_at<=\?2 AND g\.ends_at>\?2/);
  assert.match(billing, /getActiveLeaderboardRewardPlan/);
  assert.match(billing, /reward\.rank > activeRank/);
  assert.doesNotMatch(service, /INSERT[^;]+INTO\s+user_subscriptions/i);
  assert.doesNotMatch(service, /price_subunits\s*=/i);
});
