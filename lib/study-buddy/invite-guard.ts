import "server-only";

import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import {
  STUDY_BUDDY_INVITE_LIMIT,
  canSendStudyTogetherInvite,
  canonicalBuddyPair,
} from "./policy.mjs";

export class StudyTogetherInviteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StudyTogetherInviteError";
    this.status = status;
  }
}

function cleanUserId(value: unknown, label: string) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(clean)) throw new StudyTogetherInviteError(`${label} is invalid.`);
  return clean;
}

export async function assertStudyTogetherInviteAllowed(senderUserId: string, rawRecipientUserId: unknown) {
  const recipientUserId = cleanUserId(rawRecipientUserId, "Study buddy user ID");
  if (recipientUserId === senderUserId) throw new StudyTogetherInviteError("You cannot invite yourself to Study Together.");

  const [memberA, memberB] = canonicalBuddyPair(senderUserId, recipientUserId);
  const db = getD1RuntimeDatabase();
  const relationship = await db.prepare(`SELECT id,status FROM study_buddy_relationships
    WHERE member_a_user_id=?1 AND member_b_user_id=?2 LIMIT 1`)
    .bind(memberA, memberB).first<{ id: string; status: string }>();

  if (!relationship || relationship.status !== "accepted") {
    throw new StudyTogetherInviteError("An accepted Study Buddy relationship is required.", 403);
  }

  const [recipientSafety, anyBlock, recent, active] = await Promise.all([
    db.prepare(`SELECT muted,blocked FROM study_buddy_safety
      WHERE owner_user_id=?1 AND target_user_id=?2 LIMIT 1`)
      .bind(recipientUserId, senderUserId).first<{ muted: number; blocked: number }>(),
    db.prepare(`SELECT 1 AS ok FROM study_buddy_safety
      WHERE ((owner_user_id=?1 AND target_user_id=?2) OR (owner_user_id=?2 AND target_user_id=?1)) AND blocked=1 LIMIT 1`)
      .bind(senderUserId, recipientUserId).first<{ ok: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM study_together_sessions
      WHERE relationship_id=?1 AND created_by_user_id=?2 AND started_at>=datetime('now','-24 hours')`)
      .bind(relationship.id, senderUserId).first<{ count: number }>(),
    db.prepare(`SELECT 1 AS ok FROM study_together_sessions
      WHERE relationship_id=?1 AND status='active' LIMIT 1`)
      .bind(relationship.id).first<{ ok: number }>(),
  ]);

  const mutedByRecipient = recipientSafety?.muted === 1;
  const blocked = Boolean(anyBlock) || recipientSafety?.blocked === 1;
  const recentCount = Number(recent?.count ?? 0);
  const hasActive = Boolean(active);

  if (!canSendStudyTogetherInvite({ status: relationship.status, blocked, mutedByRecipient, recentCount, hasActive })) {
    if (blocked) throw new StudyTogetherInviteError("This Study Buddy relationship is blocked.", 403);
    if (mutedByRecipient) throw new StudyTogetherInviteError("This buddy has muted Study Together invitations from you.", 403);
    if (hasActive) throw new StudyTogetherInviteError("A Study Together invitation is already active with this buddy.", 409);
    throw new StudyTogetherInviteError(`You can send at most ${STUDY_BUDDY_INVITE_LIMIT} Study Together invitations to one buddy in 24 hours.`, 429);
  }

  return { relationshipId: relationship.id, recipientUserId };
}
