import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("d1/migrations/0018_product_phase7_community_verification.sql");
const phase7 = read("lib/community/phase7.ts");
const service = read("lib/community/service.ts");
const hot = read("lib/data/d1/hot-screens.ts");
const roles = read("lib/authorization/roles.ts");
const chat = read("components/community/community-chat.tsx");
const verificationUi = read("components/community/verification-console.tsx");
const messageRoute = read("app/api/community/channels/[channel]/messages/route.ts");
const verificationRoute = read("app/api/admin/community/verifications/route.ts");
const phase3 = read("lib/study/phase3.ts");
const notes = read("lib/notes/phase6.ts");
const deploy = read(".github/workflows/deploy-staging.yml");

test("Product Phase 7 preserves the existing structured Community channel hierarchy", () => {
  assert.match(service, /groupChannels/);
  assert.match(service, /channel\.scope === "global"/);
  assert.match(service, /channel\.scope === "level"/);
  assert.match(service, /channel\.scope === "subject"/);
  assert.match(hot, /scope_type='global'/);
  assert.match(hot, /scope_type='level'/);
  assert.match(hot, /scope_type='subject'/);
});

test("Product Phase 7 applies all six required filters on the server", () => {
  for (const filter of ["all", "following", "verified", "rankers", "high_scorers", "saved"]) assert.match(phase7, new RegExp(`id: "${filter}"`));
  assert.match(phase7, /community_follows f/);
  assert.match(phase7, /community_saved_messages s/);
  assert.match(phase7, /community_verifications v/);
  assert.match(messageRoute, /getPhase7CommunityMessagePage/);
  assert.match(messageRoute, /filter: url\.searchParams\.get\("filter"\)/);
  assert.match(chat, /Community feed filters/);
});

test("Product Phase 7 server-safe filtering cannot reveal inaccessible level group or subject channels", () => {
  assert.match(phase7, /visibleChannelsForViewer/);
  assert.match(phase7, /assertVisibleChannel/);
  assert.match(phase7, /course_groups g/);
  assert.match(phase7, /g\.code=\?4/);
  assert.ok(phase7.indexOf("assertVisibleChannel(input.channelSlug") < phase7.indexOf("FROM community_messages m WHERE"));
  assert.match(phase7, /assertVisibleMessage/);
});

test("Product Phase 7 reconciles Phase 3 session doubts instead of creating a duplicate doubt store", () => {
  assert.match(phase3, /scope_type='subject'/);
  assert.match(phase3, /study_session_doubts/);
  assert.match(phase7, /FROM study_session_doubts WHERE community_message_id IN/);
  assert.match(chat, /Study session doubt/);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS community_doubts/);
});

test("Product Phase 7 verification is evidence-backed and never presented as answer correctness", () => {
  assert.match(migration, /evidence_source TEXT NOT NULL/);
  assert.match(migration, /evidence_reference TEXT NOT NULL/);
  assert.match(migration, /granted_by TEXT NOT NULL/);
  assert.match(phase7, /verificationLabel/);
  assert.match(chat, /They do not mean an individual answer is correct/);
  assert.match(chat, /This badge does not certify this answer/);
  assert.doesNotMatch(phase7, /answer_is_correct|correct_answer/);
});

test("Product Phase 7 grants and revokes verification only for admin owner and parent owner roles", () => {
  for (const role of ["student", "moderator", "admin", "owner", "parent_owner"]) assert.match(roles, new RegExp(`"${role}"`));
  assert.match(phase7, /VERIFICATION_MANAGER_ROLES = new Set<AppRole>\(\["admin", "owner", "parent_owner"\]\)/);
  assert.match(phase7, /if \(!canManageVerification\(role\)\) throw new Error/);
  assert.match(verificationUi, /only admins\/owners can grant or revoke verification/);
  assert.match(verificationRoute, /manageCommunityVerification/);
  assert.doesNotMatch(phase7, /VERIFICATION_MANAGER_ROLES[^\n]*moderator/);
});

test("Product Phase 7 keeps moderator report block pin remove and audit behavior intact", () => {
  assert.match(hot, /COMMUNITY_MODERATOR_ROLES = \["moderator", "admin", "owner", "parent_owner"\]/);
  for (const action of ["delete_message", "restore_message", "pin", "unpin", "block", "unblock", "dismiss_report", "resolve_report"]) assert.match(hot, new RegExp(action));
  assert.match(service, /reportHotCommunityMessage/);
  assert.match(service, /moderateHotCommunity/);
  assert.match(migration, /community_verification_audit/);
  assert.match(phase7, /moderation_actions/);
});

test("Product Phase 7 Following and Saved state are owner-scoped and operate only on visible messages", () => {
  assert.match(migration, /PRIMARY KEY\(user_id,followed_user_id\)/);
  assert.match(migration, /PRIMARY KEY\(user_id,message_id\)/);
  assert.match(phase7, /toggleCommunitySavedMessage/);
  assert.match(phase7, /toggleCommunityFollowFromMessage/);
  assert.match(phase7, /await assertVisibleMessage\(messageId, identity\.id, db\)/);
  assert.match(chat, /message\.savedByViewer \? "Unsave" : "Save"/);
  assert.match(chat, /message\.followedByViewer \? "Unfollow" : "Follow"/);
});

test("Product Phase 7 preserves Community to Notes attribution and discussion links", () => {
  assert.match(chat, /communityMessageId=/);
  assert.match(chat, /Save to Notes/);
  assert.match(notes, /source_author_label/);
  assert.match(notes, /source_discussion_path/);
  assert.match(notes, /question_body/);
});

test("Product Phase 7 production deployment applies and verifies migration 0018 before web rollout", () => {
  const retainedMigrations = read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(deploy, /npm run cf:migrate:retained/);
  assert.match(retainedMigrations, /0018_product_phase7_community_verification\.sql/);
  assert.match(retainedMigrations, /\["0017"[\s\S]*\["0018"/);
  assert.match(deploy, /phase7_verifications/);
  assert.match(deploy, /phase7_follows/);
  assert.match(deploy, /phase7_saved_messages/);
  assert.ok(deploy.indexOf("Apply missing retained D1 migrations") < deploy.indexOf("Deploy web runtime"));
  assert.match(migration, /VALUES \('0018','product phase 7 community verification filters and structured doubt reconciliation'/);
});
