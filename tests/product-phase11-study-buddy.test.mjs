import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STUDY_BUDDY_NUDGE_LIMIT,
  STUDY_BUDDY_MIN_VALID_SESSION_SECONDS,
  canAccessStudyBuddyData,
  canAttachStudyTogetherSession,
  canSendStudyBuddyNudge,
  normalizeStudyBuddySharing,
  studySessionContributionMinutes,
} from "../lib/study-buddy/policy.mjs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 11 relationships are opt-in and acceptance alone shares no accountability fields", () => {
  const migration = read("d1/migrations/0021_product_phase11_study_buddy.sql");
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'pending' CHECK\(status IN \('pending','accepted','rejected','removed'\)\)/);
  assert.match(migration, /UNIQUE\(member_a_user_id,member_b_user_id\)/);
  for (const field of ["share_profile", "share_progress", "share_streak", "share_goals", "share_study_status"]) {
    assert.match(migration, new RegExp(`${field} INTEGER NOT NULL DEFAULT 0`));
  }
  assert.equal(canAccessStudyBuddyData("pending"), false);
  assert.equal(canAccessStudyBuddyData("rejected"), false);
  assert.equal(canAccessStudyBuddyData("removed"), false);
  assert.equal(canAccessStudyBuddyData("accepted"), true);
  assert.equal(canAccessStudyBuddyData("accepted", true), false);
  assert.deepEqual(normalizeStudyBuddySharing(), {
    shareProfile: false,
    shareProgress: false,
    shareStreak: false,
    shareGoals: false,
    shareStudyStatus: false,
  });
});

test("Product Phase 11 dashboard only builds private accountability data for accepted unblocked relationships", () => {
  const service = read("lib/study-buddy/service.ts");
  assert.match(service, /status='accepted'/);
  assert.match(service, /if \(await anyBlock\(ownerUserId, buddyUserId\)\) continue/);
  assert.match(service, /accountabilitySummary\(buddyUserId, buddySharing\)/);
  assert.match(service, /if \(sharing\.shareProfile\)/);
  assert.match(service, /if \(sharing\.shareProgress\)/);
  assert.match(service, /if \(sharing\.shareStreak\)/);
  assert.doesNotMatch(service, /FROM\s+notes|JOIN\s+notes|test_attempts|marks_scored|body_html|body_text|answer_sheet|checked_paper/i);
});

test("Product Phase 11 nudge mute and 24-hour rate limits are server-enforced", () => {
  assert.equal(STUDY_BUDDY_NUDGE_LIMIT, 3);
  assert.equal(canSendStudyBuddyNudge({ status: "pending", recentCount: 0 }), false);
  assert.equal(canSendStudyBuddyNudge({ status: "accepted", mutedByRecipient: true, recentCount: 0 }), false);
  assert.equal(canSendStudyBuddyNudge({ status: "accepted", recentCount: 2 }), true);
  assert.equal(canSendStudyBuddyNudge({ status: "accepted", recentCount: 3 }), false);
  const service = read("lib/study-buddy/service.ts");
  assert.match(service, /recipientSafety\?\.muted === 1/);
  assert.match(service, /created_at>=datetime\('now','-24 hours'\)/);
  assert.match(service, /status: 429|, 429\)/);
});

test("Product Phase 11 shared goals preserve per-person contribution from owned canonical study sessions", () => {
  const migration = read("d1/migrations/0021_product_phase11_study_buddy.sql");
  const service = read("lib/study-buddy/service.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS study_buddy_goal_contributions/);
  assert.match(migration, /PRIMARY KEY\(goal_id,user_id,study_session_id\)/);
  assert.match(migration, /study_session_id TEXT NOT NULL REFERENCES study_sessions\(id\)/);
  assert.match(service, /WHERE id=\?1 AND user_id=\?2 AND duration_seconds>=60/);
  assert.match(service, /INSERT OR IGNORE INTO study_buddy_goal_contributions\(goal_id,user_id,study_session_id,minutes\)/);
  assert.match(service, /Object\.fromEntries\(\(contributions\.results/);
  assert.doesNotMatch(service, /input\.minutes|body\.minutes|contributorUserId/);
});

test("Product Phase 11 valid-session contribution rejects trivial sessions and derives minutes", () => {
  assert.equal(STUDY_BUDDY_MIN_VALID_SESSION_SECONDS, 60);
  assert.equal(studySessionContributionMinutes(59), 0);
  assert.equal(studySessionContributionMinutes(60), 1);
  assert.equal(studySessionContributionMinutes(119), 1);
  assert.equal(studySessionContributionMinutes(3600), 60);
});

test("Product Phase 11 Study Together links canonical sessions without duplicating study credit", () => {
  const migration = read("d1/migrations/0021_product_phase11_study_buddy.sql");
  const service = read("lib/study-buddy/service.ts");
  assert.match(migration, /canonical_study_session_id TEXT UNIQUE REFERENCES study_sessions\(id\)/);
  assert.equal(canAttachStudyTogetherSession({ ownsSession: false, durationSeconds: 3600, overlapsTogether: true }), false);
  assert.equal(canAttachStudyTogetherSession({ ownsSession: true, durationSeconds: 59, overlapsTogether: true }), false);
  assert.equal(canAttachStudyTogetherSession({ ownsSession: true, durationSeconds: 3600, alreadyAttached: true, overlapsTogether: true }), false);
  assert.equal(canAttachStudyTogetherSession({ ownsSession: true, durationSeconds: 3600, overlapsTogether: false }), false);
  assert.equal(canAttachStudyTogetherSession({ ownsSession: true, durationSeconds: 3600, overlapsTogether: true }), true);
  assert.match(service, /WHERE id=\?1 AND user_id=\?2 LIMIT 1/);
  assert.match(service, /UPDATE study_together_participants SET canonical_study_session_id/);
  assert.doesNotMatch(service, /INSERT INTO study_sessions/i);
});

test("Product Phase 11 block mute and report controls terminate unsafe accountability paths", () => {
  const migration = read("d1/migrations/0021_product_phase11_study_buddy.sql");
  const service = read("lib/study-buddy/service.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS study_buddy_safety/);
  assert.match(migration, /muted INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /blocked INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS study_buddy_reports/);
  assert.match(service, /mode === "mute"|mode === "unmute"/);
  assert.match(service, /mode === "block"|mode === "unblock"/);
  assert.match(service, /SET status='removed'.*status IN \('pending','accepted'\)/s);
  assert.match(service, /UPDATE study_together_sessions SET status='cancelled'/);
  assert.match(service, /INSERT INTO study_buddy_reports/);
});

test("Product Phase 11 API requires auth and same-origin checks for every mutation", () => {
  const route = read("app/api/study-buddy/route.ts");
  assert.match(route, /optionalUser/);
  assert.match(route, /assertSameOriginMutation/);
  assert.match(route, /private, no-store/);
  for (const action of ["request", "respond", "remove", "sharing", "nudge", "createGoal", "contributeGoal", "startTogether", "joinTogether", "completeTogether", "safety", "report"]) {
    assert.match(route, new RegExp(`case "${action}"`));
  }
});

test("Product Phase 11 UI stays an accountability workspace rather than a generic social or media system", () => {
  const component = read("components/study-buddy/study-buddy-workspace.tsx");
  const navigation = read("components/shell/navigation.tsx");
  assert.match(component, /Connect by user ID/);
  assert.match(component, /What I share with this buddy/);
  assert.match(component, /Shared weekly goals/);
  assert.match(component, /Study Together/);
  assert.match(component, /no audio\/video/i);
  assert.match(component, /Mute/);
  assert.match(component, /Block/);
  assert.match(component, /Report safety issue/);
  assert.match(component, /no public people-search or follower feed/i);
  assert.doesNotMatch(component, /getUserMedia|RTCPeerConnection|MediaRecorder|camera|microphone/i);
  assert.match(navigation, /Study Buddy/);
});

test("Product Phase 11 deployment applies migration 0021 and Phase 12 remains untouched", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const retainedMigrations = read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(workflow, /npm run cf:migrate:retained/);
  assert.match(retainedMigrations, /0021_product_phase11_study_buddy\.sql/);
  assert.match(retainedMigrations, /\["0021"/);
  assert.match(workflow, /phase11_study_buddy_relationships/);
  assert.match(workflow, /phase11_study_buddy_goals/);
  assert.match(workflow, /phase11_study_together_sessions/);
  assert.match(workflow, /phase11_study_buddy_reports/);
  assert.equal(existsSync(join(root, "docs/CA_PROGRESS_PRODUCT_PHASE12_STATUS.md")), false);
});
