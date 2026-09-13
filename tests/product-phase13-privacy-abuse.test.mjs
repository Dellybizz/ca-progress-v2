import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { hasAdminCapability } from "../lib/authorization/capabilities.mjs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 13 leaderboard API is authenticated, no-store and emits only service-sanitized entries", () => {
  const route = read("app/api/leaderboard/route.ts");
  const policy = read("lib/gamification/phase13-policy.mjs");
  const service = read("lib/gamification/phase13-service.ts");
  assert.match(route, /optionalUser/);
  assert.match(route, /private, no-store/);
  assert.match(route, /getLeaderboard/);
  assert.match(service, /lp\.opted_in=1/);
  assert.match(service, /entries: entries\.map\(\(entry\) => publicLeaderboardEntry\(entry\)\)/);
  assert.match(policy, /rank:/);
  assert.match(policy, /displayName:/);
  assert.match(policy, /totalXp:/);
  assert.match(policy, /levelName:/);
  assert.doesNotMatch(policy.slice(policy.indexOf("export function publicLeaderboardEntry")), /email:/i);
});

test("Product Phase 13 opt-out cannot be bypassed by category and future categories are not exposed", () => {
  const service = read("lib/gamification/phase13-service.ts");
  const policy = read("lib/gamification/phase13-policy.mjs");
  assert.match(service, /WHERE lp\.opted_in=1/);
  assert.match(policy, /\["overall", "foundation", "intermediate", "final"\]/);
  assert.doesNotMatch(policy.split("LEADERBOARD_CATEGORIES")[1].split(";")[0], /study|consistency|improvement/i);
});

test("Product Phase 13 anti-cheat is reviewable and never performs destructive account or academic actions", () => {
  const service = read("lib/gamification/phase13-service.ts");
  const admin = read("app/api/admin/gamification/route.ts");
  const migration = read("d1/migrations/0023_product_phase13_leaderboards_rewards_referrals.sql");
  assert.match(service, /status IN \('pending','upheld'\)/);
  assert.match(service, /reviewAntiCheatFlag/);
  assert.match(admin, /authorized\("gamification\.review"\)/);
  assert.match(admin, /requireAdminCapability/);
  assert.match(admin, /recordAdminAuditEvent/);
  assert.equal(hasAdminCapability("moderator", "gamification.review"), true);
  assert.equal(hasAdminCapability("admin", "gamification.review"), true);
  assert.equal(hasAdminCapability("student", "gamification.review"), false);
  assert.match(admin, /decision === "clear" \|\| body\.decision === "uphold"/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'pending' CHECK\(status IN \('pending','cleared','upheld'\)\)/);
  assert.doesNotMatch(admin, /getServerAppRole|isPrivilegedRole/);
  assert.doesNotMatch(service, /DELETE\s+FROM\s+(app_users|profiles|chapter_progress|progress_events|study_sessions|test_attempts)/i);
  assert.doesNotMatch(service, /UPDATE\s+(app_users|profiles|chapter_progress|study_sessions|test_attempts)/i);
  assert.doesNotMatch(admin, /delete|suspend|disable_account/i);
});

test("Product Phase 13 suspicious users keep normal access while only reward eligibility is gated", () => {
  const service = read("lib/gamification/phase13-service.ts");
  const billing = read("lib/billing/service.ts");
  assert.match(service, /isRewardEligible/);
  assert.match(service, /eligible \? "scheduled" : "withheld"/);
  assert.doesNotMatch(service, /account_state\s*=|status='disabled'|status="disabled"/i);
  assert.doesNotMatch(billing, /anti_cheat_flags/);
});

test("Product Phase 13 referral flow does not award signup and grants exactly one immutable bonus after activation", () => {
  const service = read("lib/gamification/phase13-service.ts");
  const migration = read("d1/migrations/0023_product_phase13_leaderboards_rewards_referrals.sql");
  const registerSection = service.slice(service.indexOf("export async function registerReferral"), service.indexOf("export async function reconcileReferralActivation"));
  assert.doesNotMatch(registerSection, /gamification_bonus_ledger|xp_amount/);
  assert.match(service, /referralActivationState/);
  assert.match(service, /INSERT OR IGNORE INTO gamification_bonus_ledger/);
  assert.match(service, /REFERRAL_ACTIVATION_XP/);
  assert.match(migration, /UNIQUE\(user_id,event_key\)/);
  assert.match(migration, /CHECK\(referrer_user_id <> referred_user_id\)/);
});

test("Product Phase 13 referral bonus cannot mutate Phase 12 immutable XP constraints", () => {
  const phase12 = read("d1/migrations/0022_product_phase12_gamification.sql");
  const phase13 = read("d1/migrations/0023_product_phase13_leaderboards_rewards_referrals.sql");
  assert.match(phase12, /CHECK\(xp_amount BETWEEN 1 AND 100\)/);
  assert.match(phase13, /CREATE TABLE IF NOT EXISTS gamification_bonus_ledger/);
  assert.doesNotMatch(phase13, /ALTER TABLE\s+xp_ledger/i);
  assert.doesNotMatch(phase13, /DROP TABLE\s+xp_ledger/i);
});

test("Product Phase 13 reward settlement is owner-only, post-period, rank-limited and idempotent", () => {
  const service = read("lib/gamification/phase13-service.ts");
  const admin = read("app/api/admin/gamification/route.ts");
  const migration = read("d1/migrations/0023_product_phase13_leaderboards_rewards_referrals.sql");
  assert.match(admin, /authorized\("rewards\.settle"\)/);
  assert.match(admin, /settle_rewards/);
  assert.equal(hasAdminCapability("moderator", "rewards.settle"), false);
  assert.equal(hasAdminCapability("admin", "rewards.settle"), false);
  assert.equal(hasAdminCapability("owner", "rewards.settle"), true);
  assert.equal(hasAdminCapability("parent_owner", "rewards.settle"), true);
  assert.match(service, /rewards can only be settled after the competition period closes/i);
  assert.match(service, /ranked\.slice\(0, 3\)/);
  assert.match(migration, /UNIQUE\(competition_period,user_id\)/);
  assert.match(migration, /UNIQUE\(competition_period,rank\)/);
  assert.match(service, /INSERT OR IGNORE INTO leaderboard_reward_grants/);
});

test("Product Phase 13 share UI requires an explicit user action and contains no private identifier prop", () => {
  const component = read("components/gamification/phase13-panel.tsx");
  assert.match(component, /WhatsApp/);
  assert.match(component, /Instagram/);
  assert.match(component, /Download/);
  assert.match(component, /navigator\.share/);
  assert.match(component, /canvas\.toBlob/);
  assert.doesNotMatch(component, /userId|emailAddress|provider_subject/);
  assert.match(component, /Sharing is always initiated by you/);
});

test("Product Phase 13 remains isolated from Phase 14 export/backup work", () => {
  const phase13Files = [
    "lib/gamification/phase13-policy.mjs",
    "lib/gamification/phase13-service.ts",
    "app/api/gamification/phase13/route.ts",
    "app/api/leaderboard/route.ts",
    "app/api/admin/gamification/route.ts",
    "components/gamification/phase13-panel.tsx",
    "d1/migrations/0023_product_phase13_leaderboards_rewards_referrals.sql",
  ].map(read).join("\n");
  assert.doesNotMatch(phase13Files, /Download My CA Progress Data|complete backup|export schema|Study CSV|Test History CSV/i);
  assert.equal(existsSync(join(root, "d1/migrations/0024_product_phase14_export_backup.sql")), false);
});
