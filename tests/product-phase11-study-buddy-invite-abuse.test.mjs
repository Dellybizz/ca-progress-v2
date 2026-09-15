import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STUDY_BUDDY_INVITE_LIMIT,
  canSendStudyTogetherInvite,
} from "../lib/study-buddy/policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("Study Together invitations are bounded and recipient mute is authoritative", () => {
  assert.equal(STUDY_BUDDY_INVITE_LIMIT, 3);
  assert.equal(canSendStudyTogetherInvite({ status: "accepted", recentCount: 0 }), true);
  assert.equal(canSendStudyTogetherInvite({ status: "pending", recentCount: 0 }), false);
  assert.equal(canSendStudyTogetherInvite({ status: "accepted", mutedByRecipient: true, recentCount: 0 }), false);
  assert.equal(canSendStudyTogetherInvite({ status: "accepted", blocked: true, recentCount: 0 }), false);
  assert.equal(canSendStudyTogetherInvite({ status: "accepted", hasActive: true, recentCount: 0 }), false);
  assert.equal(canSendStudyTogetherInvite({ status: "accepted", recentCount: STUDY_BUDDY_INVITE_LIMIT }), false);
});

test("Study Together mutation executes the server-side invite guard before creation", () => {
  const route = read("app/api/study-buddy/route.ts");
  const startCase = route.match(/case "startTogether": \{([\s\S]*?)break;\s*\}/)?.[1] ?? "";
  assert.match(startCase, /await assertStudyTogetherInviteAllowed\(user\.id, body\.buddyUserId\)/);
  assert.match(startCase, /await startStudyTogether\(user\.id, body\.buddyUserId\)/);
  assert.ok(startCase.indexOf("assertStudyTogetherInviteAllowed") < startCase.indexOf("startStudyTogether"));
});

test("invite guard checks accepted relationship, mute/block state, active invite and 24-hour sender-recipient rate", () => {
  const guard = read("lib/study-buddy/invite-guard.ts");
  assert.match(guard, /relationship\.status !== "accepted"/);
  assert.match(guard, /owner_user_id=\?1 AND target_user_id=\?2/);
  assert.match(guard, /mutedByRecipient = recipientSafety\?\.muted === 1/);
  assert.match(guard, /AND blocked=1 LIMIT 1/);
  assert.match(guard, /created_by_user_id=\?2 AND started_at>=datetime\('now','-24 hours'\)/);
  assert.match(guard, /status='active' LIMIT 1/);
  assert.match(guard, /Study Together invitations to one buddy in 24 hours/);
});

test("D1 serializes active Study Together invitations for one relationship", () => {
  const migration = read("d1/migrations/0021_product_phase11_study_buddy.sql");
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_study_together_one_active_relationship ON study_together_sessions\(relationship_id\) WHERE status='active'/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_study_together_invite_rate ON study_together_sessions\(relationship_id,created_by_user_id,started_at DESC\)/);
});
