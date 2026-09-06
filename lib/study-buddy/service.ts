import "server-only";

import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import {
  STUDY_BUDDY_NUDGE_LIMIT,
  canAccessStudyBuddyData,
  canAttachStudyTogetherSession,
  canSendStudyBuddyNudge,
  canonicalBuddyPair,
  normalizeStudyBuddySharing,
  studySessionContributionMinutes,
} from "./policy.mjs";

export type StudyBuddySharing = {
  shareProfile: boolean;
  shareProgress: boolean;
  shareStreak: boolean;
  shareGoals: boolean;
  shareStudyStatus: boolean;
};

type RelationshipRow = {
  id: string;
  member_a_user_id: string;
  member_b_user_id: string;
  requester_user_id: string;
  recipient_user_id: string;
  status: string;
  requested_at: string;
  responded_at: string | null;
  ended_at: string | null;
};

type SharingRow = {
  owner_user_id: string;
  share_profile: number;
  share_progress: number;
  share_streak: number;
  share_goals: number;
  share_study_status: number;
};

type SafetyRow = { muted: number; blocked: number };
type ProfileRow = {
  user_id: string;
  display_name: string | null;
  ca_level: string | null;
  attempt_key: string | null;
  public_bio: string | null;
  show_level: number | null;
  show_attempt: number | null;
};

type StudySessionRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
};

type TogetherRow = {
  id: string;
  relationship_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
};

export class StudyBuddyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "StudyBuddyError";
    this.status = status;
  }
}

function userId(value: unknown, label = "Study buddy user ID") {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(clean)) throw new StudyBuddyError(`${label} is invalid.`);
  return clean;
}

function cleanText(value: unknown, label: string, max: number, required = true) {
  const clean = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (required && !clean) throw new StudyBuddyError(`${label} is required.`);
  if (clean.length > max) throw new StudyBuddyError(`${label} must be ${max} characters or fewer.`);
  return clean;
}

function weekStart(value: unknown) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || Number.isNaN(Date.parse(`${clean}T00:00:00.000Z`))) {
    throw new StudyBuddyError("Choose a valid weekly goal start date.");
  }
  return clean;
}

function otherUser(row: RelationshipRow, ownerUserId: string) {
  return row.member_a_user_id === ownerUserId ? row.member_b_user_id : row.member_a_user_id;
}

function sharingFromRow(row: SharingRow | null | undefined): StudyBuddySharing {
  return normalizeStudyBuddySharing({
    shareProfile: row?.share_profile === 1,
    shareProgress: row?.share_progress === 1,
    shareStreak: row?.share_streak === 1,
    shareGoals: row?.share_goals === 1,
    shareStudyStatus: row?.share_study_status === 1,
  });
}

async function requireActiveAccount(targetUserId: string) {
  const target = await getD1RuntimeDatabase().prepare(
    "SELECT user_id FROM app_users WHERE user_id=?1 AND account_state='active' LIMIT 1",
  ).bind(targetUserId).first<{ user_id: string }>();
  if (!target) throw new StudyBuddyError("That CA Progress account was not found.", 404);
}

async function relationshipBetween(ownerUserId: string, buddyUserId: string) {
  const [a, b] = canonicalBuddyPair(ownerUserId, buddyUserId);
  return getD1RuntimeDatabase().prepare(`SELECT id,member_a_user_id,member_b_user_id,requester_user_id,recipient_user_id,status,requested_at,responded_at,ended_at
    FROM study_buddy_relationships WHERE member_a_user_id=?1 AND member_b_user_id=?2 LIMIT 1`)
    .bind(a, b).first<RelationshipRow>();
}

async function acceptedRelationship(ownerUserId: string, rawBuddyUserId: unknown) {
  const buddyUserId = userId(rawBuddyUserId);
  if (buddyUserId === ownerUserId) throw new StudyBuddyError("You cannot use Study Buddy with yourself.");
  const row = await relationshipBetween(ownerUserId, buddyUserId);
  if (!row || !canAccessStudyBuddyData(row.status, false)) throw new StudyBuddyError("An accepted Study Buddy relationship is required.", 403);
  const blocked = await anyBlock(ownerUserId, buddyUserId);
  if (blocked) throw new StudyBuddyError("This Study Buddy relationship is blocked.", 403);
  return { row, buddyUserId };
}

async function anyBlock(a: string, b: string) {
  const row = await getD1RuntimeDatabase().prepare(`SELECT 1 AS ok FROM study_buddy_safety
    WHERE ((owner_user_id=?1 AND target_user_id=?2) OR (owner_user_id=?2 AND target_user_id=?1)) AND blocked=1 LIMIT 1`)
    .bind(a, b).first<{ ok: number }>();
  return Boolean(row);
}

async function safety(ownerUserId: string, targetUserId: string) {
  return getD1RuntimeDatabase().prepare("SELECT muted,blocked FROM study_buddy_safety WHERE owner_user_id=?1 AND target_user_id=?2 LIMIT 1")
    .bind(ownerUserId, targetUserId).first<SafetyRow>();
}

async function sharingFor(relationshipId: string, ownerUserId: string) {
  const row = await getD1RuntimeDatabase().prepare(`SELECT owner_user_id,share_profile,share_progress,share_streak,share_goals,share_study_status
    FROM study_buddy_sharing WHERE relationship_id=?1 AND owner_user_id=?2 LIMIT 1`)
    .bind(relationshipId, ownerUserId).first<SharingRow>();
  return sharingFromRow(row);
}

async function bothSharingEnabled(relationshipId: string, memberA: string, memberB: string, field: "share_goals" | "share_study_status") {
  const row = await getD1RuntimeDatabase().prepare(`SELECT COUNT(*) AS enabled FROM study_buddy_sharing
    WHERE relationship_id=?1 AND owner_user_id IN (?2,?3) AND ${field}=1`).bind(relationshipId, memberA, memberB).first<{ enabled: number }>();
  return Number(row?.enabled ?? 0) === 2;
}

function utcStreak(rows: { ended_at: string }[], now = new Date()) {
  const days = new Set(rows.map((row) => row.ended_at.slice(0, 10)));
  let cursor = now;
  let key = cursor.toISOString().slice(0, 10);
  if (!days.has(key)) {
    cursor = new Date(now.valueOf() - 86400000);
    key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) return 0;
  }
  let streak = 0;
  while (days.has(key)) {
    streak += 1;
    cursor = new Date(cursor.valueOf() - 86400000);
    key = cursor.toISOString().slice(0, 10);
  }
  return streak;
}

async function accountabilitySummary(targetUserId: string, sharing: StudyBuddySharing) {
  const db = getD1RuntimeDatabase();
  const summary: Record<string, unknown> = {};
  if (sharing.shareProfile) {
    const profile = await db.prepare(`SELECT p.user_id,p.display_name,p.ca_level,p.attempt_key,sp.public_bio,sp.show_level,sp.show_attempt
      FROM profiles p LEFT JOIN study_profiles sp ON sp.user_id=p.user_id WHERE p.user_id=?1 LIMIT 1`)
      .bind(targetUserId).first<ProfileRow>();
    if (profile?.public_bio) summary.publicBio = profile.public_bio;
    if (profile?.show_level === 1 && profile.ca_level) summary.caLevel = profile.ca_level;
    if (profile?.show_attempt === 1 && profile.attempt_key) summary.attemptKey = profile.attempt_key;
  }
  if (sharing.shareProgress) {
    const row = await db.prepare(`SELECT COALESCE(SUM(duration_seconds),0) AS seconds FROM study_sessions
      WHERE user_id=?1 AND ended_at>=datetime('now','-7 days')`).bind(targetUserId).first<{ seconds: number }>();
    summary.weekStudyMinutes = Math.floor(Number(row?.seconds ?? 0) / 60);
  }
  if (sharing.shareStreak) {
    const rows = await db.prepare(`SELECT ended_at FROM study_sessions WHERE user_id=?1 AND ended_at>=datetime('now','-120 days') ORDER BY ended_at DESC LIMIT 500`)
      .bind(targetUserId).all<{ ended_at: string }>();
    summary.currentStreakDays = utcStreak(rows.results ?? []);
  }
  return summary;
}

export async function getStudyBuddyDashboard(ownerUserId: string) {
  const db = getD1RuntimeDatabase();
  const pending = await db.prepare(`SELECT r.id,r.member_a_user_id,r.member_b_user_id,r.requester_user_id,r.recipient_user_id,r.status,r.requested_at,r.responded_at,r.ended_at,
      p.display_name AS other_display_name
    FROM study_buddy_relationships r
    LEFT JOIN profiles p ON p.user_id=CASE WHEN r.requester_user_id=?1 THEN r.recipient_user_id ELSE r.requester_user_id END
    WHERE (r.requester_user_id=?1 OR r.recipient_user_id=?1) AND r.status='pending' ORDER BY r.requested_at DESC`)
    .bind(ownerUserId).all<RelationshipRow & { other_display_name: string | null }>();

  const accepted = await db.prepare(`SELECT id,member_a_user_id,member_b_user_id,requester_user_id,recipient_user_id,status,requested_at,responded_at,ended_at
    FROM study_buddy_relationships WHERE (member_a_user_id=?1 OR member_b_user_id=?1) AND status='accepted' ORDER BY responded_at DESC`)
    .bind(ownerUserId).all<RelationshipRow>();

  const buddies = [] as Record<string, unknown>[];
  for (const relationship of accepted.results ?? []) {
    const buddyUserId = otherUser(relationship, ownerUserId);
    if (await anyBlock(ownerUserId, buddyUserId)) continue;
    const [profile, mySharing, buddySharing, mySafety] = await Promise.all([
      db.prepare("SELECT user_id,display_name FROM profiles WHERE user_id=?1 LIMIT 1").bind(buddyUserId).first<{ user_id: string; display_name: string | null }>(),
      sharingFor(relationship.id, ownerUserId),
      sharingFor(relationship.id, buddyUserId),
      safety(ownerUserId, buddyUserId),
    ]);
    const accountability = await accountabilitySummary(buddyUserId, buddySharing);
    let goals: Record<string, unknown>[] = [];
    if (mySharing.shareGoals && buddySharing.shareGoals) {
      const goalRows = await db.prepare(`SELECT id,title,week_start,target_minutes_per_person,status,created_by_user_id
        FROM study_buddy_goals WHERE relationship_id=?1 AND status<>'cancelled' ORDER BY week_start DESC,created_at DESC LIMIT 12`)
        .bind(relationship.id).all<{ id: string; title: string; week_start: string; target_minutes_per_person: number; status: string; created_by_user_id: string }>();
      goals = await Promise.all((goalRows.results ?? []).map(async (goal) => {
        const contributions = await db.prepare(`SELECT user_id,COALESCE(SUM(minutes),0) AS minutes FROM study_buddy_goal_contributions
          WHERE goal_id=?1 GROUP BY user_id`).bind(goal.id).all<{ user_id: string; minutes: number }>();
        return { ...goal, contributions: Object.fromEntries((contributions.results ?? []).map((row) => [row.user_id, Number(row.minutes)])) };
      }));
    }
    let studyTogether: Record<string, unknown> | null = null;
    if (mySharing.shareStudyStatus && buddySharing.shareStudyStatus) {
      const together = await db.prepare(`SELECT id,relationship_id,status,started_at,ended_at FROM study_together_sessions
        WHERE relationship_id=?1 AND status='active' ORDER BY started_at DESC LIMIT 1`).bind(relationship.id).first<TogetherRow>();
      if (together) {
        const participants = await db.prepare(`SELECT user_id,joined_at,canonical_study_session_id,completed_at FROM study_together_participants
          WHERE study_together_id=?1 ORDER BY user_id`).bind(together.id).all<{ user_id: string; joined_at: string | null; canonical_study_session_id: string | null; completed_at: string | null }>();
        studyTogether = { ...together, participants: participants.results ?? [] };
      }
    }
    buddies.push({
      relationshipId: relationship.id,
      userId: buddyUserId,
      displayName: profile?.display_name ?? "Study buddy",
      mySharing,
      buddySharing,
      muted: mySafety?.muted === 1,
      accountability,
      goals,
      studyTogether,
    });
  }

  const recentNudges = await db.prepare(`SELECT n.id,n.sender_user_id,n.message,n.created_at,p.display_name AS sender_display_name
    FROM study_buddy_nudges n LEFT JOIN profiles p ON p.user_id=n.sender_user_id
    WHERE n.recipient_user_id=?1 ORDER BY n.created_at DESC LIMIT 12`).bind(ownerUserId)
    .all<{ id: string; sender_user_id: string; message: string; created_at: string; sender_display_name: string | null }>();

  return {
    incomingRequests: (pending.results ?? []).filter((row) => row.recipient_user_id === ownerUserId).map((row) => ({
      relationshipId: row.id, userId: row.requester_user_id, displayName: row.other_display_name ?? "Student", requestedAt: row.requested_at,
    })),
    outgoingRequests: (pending.results ?? []).filter((row) => row.requester_user_id === ownerUserId).map((row) => ({
      relationshipId: row.id, userId: row.recipient_user_id, displayName: row.other_display_name ?? "Student", requestedAt: row.requested_at,
    })),
    buddies,
    recentNudges: recentNudges.results ?? [],
    nudgeLimitPer24Hours: STUDY_BUDDY_NUDGE_LIMIT,
  };
}

export async function requestStudyBuddy(ownerUserId: string, rawBuddyUserId: unknown) {
  const buddyUserId = userId(rawBuddyUserId);
  if (buddyUserId === ownerUserId) throw new StudyBuddyError("You cannot send yourself a Study Buddy request.");
  await requireActiveAccount(buddyUserId);
  if (await anyBlock(ownerUserId, buddyUserId)) throw new StudyBuddyError("A Study Buddy request cannot be sent while either account has blocked the other.", 403);
  const existing = await relationshipBetween(ownerUserId, buddyUserId);
  if (existing?.status === "accepted") throw new StudyBuddyError("You are already Study Buddies.", 409);
  if (existing?.status === "pending") throw new StudyBuddyError("A Study Buddy request is already pending.", 409);
  const [a, b] = canonicalBuddyPair(ownerUserId, buddyUserId);
  const id = existing?.id ?? crypto.randomUUID();
  await getD1RuntimeDatabase().prepare(`INSERT INTO study_buddy_relationships(id,member_a_user_id,member_b_user_id,requester_user_id,recipient_user_id,status,requested_at,responded_at,ended_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,'pending',CURRENT_TIMESTAMP,NULL,NULL,CURRENT_TIMESTAMP)
    ON CONFLICT(member_a_user_id,member_b_user_id) DO UPDATE SET requester_user_id=excluded.requester_user_id,recipient_user_id=excluded.recipient_user_id,
      status='pending',requested_at=CURRENT_TIMESTAMP,responded_at=NULL,ended_at=NULL,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, a, b, ownerUserId, buddyUserId).run();
  return getStudyBuddyDashboard(ownerUserId);
}

export async function respondStudyBuddy(ownerUserId: string, rawBuddyUserId: unknown, response: unknown) {
  const buddyUserId = userId(rawBuddyUserId);
  const decision = response === "accept" ? "accepted" : response === "reject" ? "rejected" : null;
  if (!decision) throw new StudyBuddyError("Choose accept or reject.");
  const row = await relationshipBetween(ownerUserId, buddyUserId);
  if (!row || row.status !== "pending" || row.recipient_user_id !== ownerUserId) throw new StudyBuddyError("This Study Buddy request is no longer available.", 409);
  if (decision === "accepted" && await anyBlock(ownerUserId, buddyUserId)) throw new StudyBuddyError("Blocked accounts cannot become Study Buddies.", 403);
  const db = getD1RuntimeDatabase();
  if (decision === "accepted") {
    await db.batch([
      db.prepare("UPDATE study_buddy_relationships SET status='accepted',responded_at=CURRENT_TIMESTAMP,ended_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='pending'").bind(row.id),
      db.prepare("INSERT OR IGNORE INTO study_buddy_sharing(relationship_id,owner_user_id) VALUES(?1,?2)").bind(row.id, ownerUserId),
      db.prepare("INSERT OR IGNORE INTO study_buddy_sharing(relationship_id,owner_user_id) VALUES(?1,?2)").bind(row.id, buddyUserId),
    ]);
  } else {
    await db.prepare("UPDATE study_buddy_relationships SET status='rejected',responded_at=CURRENT_TIMESTAMP,ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='pending'").bind(row.id).run();
  }
  return getStudyBuddyDashboard(ownerUserId);
}

export async function removeStudyBuddy(ownerUserId: string, rawBuddyUserId: unknown) {
  const { row } = await acceptedRelationship(ownerUserId, rawBuddyUserId);
  await getD1RuntimeDatabase().prepare("UPDATE study_buddy_relationships SET status='removed',ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1")
    .bind(row.id).run();
  return getStudyBuddyDashboard(ownerUserId);
}

export async function updateStudyBuddySharing(ownerUserId: string, rawBuddyUserId: unknown, input: Record<string, unknown>) {
  const { row } = await acceptedRelationship(ownerUserId, rawBuddyUserId);
  const sharing = normalizeStudyBuddySharing(input);
  await getD1RuntimeDatabase().prepare(`INSERT INTO study_buddy_sharing(relationship_id,owner_user_id,share_profile,share_progress,share_streak,share_goals,share_study_status,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,CURRENT_TIMESTAMP)
    ON CONFLICT(relationship_id,owner_user_id) DO UPDATE SET share_profile=excluded.share_profile,share_progress=excluded.share_progress,
      share_streak=excluded.share_streak,share_goals=excluded.share_goals,share_study_status=excluded.share_study_status,updated_at=CURRENT_TIMESTAMP`)
    .bind(row.id, ownerUserId, sharing.shareProfile ? 1 : 0, sharing.shareProgress ? 1 : 0, sharing.shareStreak ? 1 : 0,
      sharing.shareGoals ? 1 : 0, sharing.shareStudyStatus ? 1 : 0).run();
  return getStudyBuddyDashboard(ownerUserId);
}

export async function sendStudyBuddyNudge(ownerUserId: string, rawBuddyUserId: unknown, rawMessage: unknown) {
  const { row, buddyUserId } = await acceptedRelationship(ownerUserId, rawBuddyUserId);
  const recipientSafety = await safety(buddyUserId, ownerUserId);
  const recent = await getD1RuntimeDatabase().prepare(`SELECT COUNT(*) AS count FROM study_buddy_nudges
    WHERE sender_user_id=?1 AND recipient_user_id=?2 AND created_at>=datetime('now','-24 hours')`)
    .bind(ownerUserId, buddyUserId).first<{ count: number }>();
  if (!canSendStudyBuddyNudge({ status: row.status, blocked: false, mutedByRecipient: recipientSafety?.muted === 1, recentCount: Number(recent?.count ?? 0) })) {
    if (recipientSafety?.muted === 1) throw new StudyBuddyError("This buddy has muted nudges from you.", 403);
    throw new StudyBuddyError(`You can send at most ${STUDY_BUDDY_NUDGE_LIMIT} nudges to one buddy in 24 hours.`, 429);
  }
  const message = cleanText(rawMessage, "Nudge", 160, false) || "Keep going — you've got this.";
  await getD1RuntimeDatabase().prepare(`INSERT INTO study_buddy_nudges(id,relationship_id,sender_user_id,recipient_user_id,message)
    VALUES(?1,?2,?3,?4,?5)`).bind(crypto.randomUUID(), row.id, ownerUserId, buddyUserId, message).run();
  return getStudyBuddyDashboard(ownerUserId);
}

export async function createSharedStudyGoal(ownerUserId: string, rawBuddyUserId: unknown, input: Record<string, unknown>) {
  const { row, buddyUserId } = await acceptedRelationship(ownerUserId, rawBuddyUserId);
  if (!await bothSharingEnabled(row.id, ownerUserId, buddyUserId, "share_goals")) throw new StudyBuddyError("Both buddies must opt in to shared goals first.", 403);
  const title = cleanText(input.title, "Goal title", 120);
  const start = weekStart(input.weekStart);
  const target = Number(input.targetMinutesPerPerson);
  if (!Number.isInteger(target) || target < 1 || target > 10080) throw new StudyBuddyError("Target minutes must be between 1 and 10080.");
  await getD1RuntimeDatabase().prepare(`INSERT INTO study_buddy_goals(id,relationship_id,created_by_user_id,title,week_start,target_minutes_per_person)
    VALUES(?1,?2,?3,?4,?5,?6)`).bind(crypto.randomUUID(), row.id, ownerUserId, title, start, target).run();
  return getStudyBuddyDashboard(ownerUserId);
}

export async function contributeStudySessionToGoal(ownerUserId: string, rawGoalId: unknown, rawSessionId: unknown) {
  const goalId = userId(rawGoalId, "Shared goal ID");
  const sessionId = userId(rawSessionId, "Study session ID");
  const db = getD1RuntimeDatabase();
  const goal = await db.prepare(`SELECT g.id,g.relationship_id,g.week_start,r.member_a_user_id,r.member_b_user_id,r.status
    FROM study_buddy_goals g JOIN study_buddy_relationships r ON r.id=g.relationship_id
    WHERE g.id=?1 AND g.status='active' AND (r.member_a_user_id=?2 OR r.member_b_user_id=?2) LIMIT 1`)
    .bind(goalId, ownerUserId).first<{ id: string; relationship_id: string; week_start: string; member_a_user_id: string; member_b_user_id: string; status: string }>();
  if (!goal || goal.status !== "accepted") throw new StudyBuddyError("This shared goal is unavailable.", 403);
  const buddyUserId = goal.member_a_user_id === ownerUserId ? goal.member_b_user_id : goal.member_a_user_id;
  if (await anyBlock(ownerUserId, buddyUserId)) throw new StudyBuddyError("This shared goal is unavailable.", 403);
  if (!await bothSharingEnabled(goal.relationship_id, ownerUserId, buddyUserId, "share_goals")) throw new StudyBuddyError("Both buddies must keep shared goals enabled.", 403);
  const session = await db.prepare(`SELECT id,user_id,started_at,ended_at,duration_seconds FROM study_sessions
    WHERE id=?1 AND user_id=?2 AND duration_seconds>=60 AND date(ended_at)>=date(?3) AND date(ended_at)<date(?3,'+7 days') LIMIT 1`)
    .bind(sessionId, ownerUserId, goal.week_start).first<StudySessionRow>();
  const minutes = studySessionContributionMinutes(session?.duration_seconds);
  if (!session || minutes < 1) throw new StudyBuddyError("Use one of your valid study sessions from this goal week.", 403);
  await db.prepare(`INSERT OR IGNORE INTO study_buddy_goal_contributions(goal_id,user_id,study_session_id,minutes)
    VALUES(?1,?2,?3,?4)`).bind(goalId, ownerUserId, sessionId, minutes).run();
  return getStudyBuddyDashboard(ownerUserId);
}

export async function startStudyTogether(ownerUserId: string, rawBuddyUserId: unknown) {
  const { row, buddyUserId } = await acceptedRelationship(ownerUserId, rawBuddyUserId);
  if (!await bothSharingEnabled(row.id, ownerUserId, buddyUserId, "share_study_status")) throw new StudyBuddyError("Both buddies must opt in to Study Together first.", 403);
  const db = getD1RuntimeDatabase();
  const existing = await db.prepare("SELECT id FROM study_together_sessions WHERE relationship_id=?1 AND status='active' LIMIT 1").bind(row.id).first<{ id: string }>();
  if (existing) throw new StudyBuddyError("A Study Together session is already active with this buddy.", 409);
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO study_together_sessions(id,relationship_id,created_by_user_id,status,started_at) VALUES(?1,?2,?3,'active',CURRENT_TIMESTAMP)").bind(id, row.id, ownerUserId),
    db.prepare("INSERT INTO study_together_participants(study_together_id,user_id,joined_at) VALUES(?1,?2,CURRENT_TIMESTAMP)").bind(id, ownerUserId),
    db.prepare("INSERT INTO study_together_participants(study_together_id,user_id) VALUES(?1,?2)").bind(id, buddyUserId),
  ]);
  return getStudyBuddyDashboard(ownerUserId);
}

async function togetherForParticipant(ownerUserId: string, rawTogetherId: unknown) {
  const togetherId = userId(rawTogetherId, "Study Together ID");
  const db = getD1RuntimeDatabase();
  const row = await db.prepare(`SELECT s.id,s.relationship_id,s.status,s.started_at,s.ended_at,r.member_a_user_id,r.member_b_user_id,r.status AS relationship_status
    FROM study_together_sessions s JOIN study_buddy_relationships r ON r.id=s.relationship_id
    JOIN study_together_participants p ON p.study_together_id=s.id AND p.user_id=?2
    WHERE s.id=?1 LIMIT 1`).bind(togetherId, ownerUserId)
    .first<TogetherRow & { member_a_user_id: string; member_b_user_id: string; relationship_status: string }>();
  if (!row || row.status !== "active" || row.relationship_status !== "accepted") throw new StudyBuddyError("This Study Together session is unavailable.", 409);
  const buddyUserId = row.member_a_user_id === ownerUserId ? row.member_b_user_id : row.member_a_user_id;
  if (await anyBlock(ownerUserId, buddyUserId)) throw new StudyBuddyError("This Study Together session is unavailable.", 403);
  if (!await bothSharingEnabled(row.relationship_id, ownerUserId, buddyUserId, "share_study_status")) throw new StudyBuddyError("Both buddies must keep Study Together enabled.", 403);
  return { row, buddyUserId, togetherId };
}

export async function joinStudyTogether(ownerUserId: string, rawTogetherId: unknown) {
  const { togetherId } = await togetherForParticipant(ownerUserId, rawTogetherId);
  await getD1RuntimeDatabase().prepare(`UPDATE study_together_participants SET joined_at=COALESCE(joined_at,CURRENT_TIMESTAMP)
    WHERE study_together_id=?1 AND user_id=?2`).bind(togetherId, ownerUserId).run();
  return getStudyBuddyDashboard(ownerUserId);
}

export async function completeStudyTogether(ownerUserId: string, rawTogetherId: unknown, rawStudySessionId: unknown) {
  const { row, togetherId } = await togetherForParticipant(ownerUserId, rawTogetherId);
  const sessionId = userId(rawStudySessionId, "Study session ID");
  const db = getD1RuntimeDatabase();
  const participant = await db.prepare(`SELECT joined_at,canonical_study_session_id FROM study_together_participants
    WHERE study_together_id=?1 AND user_id=?2 LIMIT 1`).bind(togetherId, ownerUserId)
    .first<{ joined_at: string | null; canonical_study_session_id: string | null }>();
  if (!participant?.joined_at) throw new StudyBuddyError("Join Study Together before completing it.", 409);
  if (participant.canonical_study_session_id) {
    if (participant.canonical_study_session_id === sessionId) return getStudyBuddyDashboard(ownerUserId);
    throw new StudyBuddyError("You already linked a study session to this Study Together session.", 409);
  }
  const session = await db.prepare(`SELECT id,user_id,started_at,ended_at,duration_seconds FROM study_sessions
    WHERE id=?1 AND user_id=?2 LIMIT 1`).bind(sessionId, ownerUserId).first<StudySessionRow>();
  const duplicate = await db.prepare("SELECT 1 AS ok FROM study_together_participants WHERE canonical_study_session_id=?1 LIMIT 1")
    .bind(sessionId).first<{ ok: number }>();
  const overlapsTogether = Boolean(session && Date.parse(session.ended_at) >= Date.parse(row.started_at));
  if (!session || !canAttachStudyTogetherSession({ ownsSession: session.user_id === ownerUserId, durationSeconds: session.duration_seconds, alreadyAttached: Boolean(duplicate), overlapsTogether })) {
    throw new StudyBuddyError("Use one of your valid, uncredited study sessions that overlaps this Study Together session.", 403);
  }
  await db.prepare(`UPDATE study_together_participants SET canonical_study_session_id=?1,completed_at=CURRENT_TIMESTAMP
    WHERE study_together_id=?2 AND user_id=?3 AND canonical_study_session_id IS NULL`).bind(sessionId, togetherId, ownerUserId).run();
  const pending = await db.prepare(`SELECT COUNT(*) AS count FROM study_together_participants
    WHERE study_together_id=?1 AND canonical_study_session_id IS NULL`).bind(togetherId).first<{ count: number }>();
  if (Number(pending?.count ?? 0) === 0) {
    await db.prepare("UPDATE study_together_sessions SET status='completed',ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='active'")
      .bind(togetherId).run();
  }
  // Important: completion only links an already-saved canonical study_sessions row.
  // It never inserts or increments study progress, so credit cannot be duplicated.
  return getStudyBuddyDashboard(ownerUserId);
}

export async function setStudyBuddySafety(ownerUserId: string, rawBuddyUserId: unknown, action: unknown) {
  const buddyUserId = userId(rawBuddyUserId);
  if (buddyUserId === ownerUserId) throw new StudyBuddyError("You cannot mute or block yourself.");
  await requireActiveAccount(buddyUserId);
  const mode = action === "mute" || action === "unmute" || action === "block" || action === "unblock" ? action : null;
  if (!mode) throw new StudyBuddyError("Choose mute, unmute, block, or unblock.");
  const db = getD1RuntimeDatabase();
  const current = await safety(ownerUserId, buddyUserId);
  const muted = mode === "mute" ? 1 : mode === "unmute" ? 0 : Number(current?.muted ?? 0);
  const blocked = mode === "block" ? 1 : mode === "unblock" ? 0 : Number(current?.blocked ?? 0);
  await db.prepare(`INSERT INTO study_buddy_safety(owner_user_id,target_user_id,muted,blocked,updated_at)
    VALUES(?1,?2,?3,?4,CURRENT_TIMESTAMP)
    ON CONFLICT(owner_user_id,target_user_id) DO UPDATE SET muted=excluded.muted,blocked=excluded.blocked,updated_at=CURRENT_TIMESTAMP`)
    .bind(ownerUserId, buddyUserId, muted, blocked).run();
  if (mode === "block") {
    const relationship = await relationshipBetween(ownerUserId, buddyUserId);
    if (relationship) {
      await db.batch([
        db.prepare("UPDATE study_buddy_relationships SET status='removed',ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status IN ('pending','accepted')").bind(relationship.id),
        db.prepare("UPDATE study_together_sessions SET status='cancelled',ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE relationship_id=?1 AND status='active'").bind(relationship.id),
      ]);
    }
  }
  return getStudyBuddyDashboard(ownerUserId);
}

export async function reportStudyBuddy(ownerUserId: string, rawBuddyUserId: unknown, rawReason: unknown, rawDetails: unknown) {
  const buddyUserId = userId(rawBuddyUserId);
  if (buddyUserId === ownerUserId) throw new StudyBuddyError("You cannot report yourself.");
  await requireActiveAccount(buddyUserId);
  const reason = cleanText(rawReason, "Report reason", 80);
  const details = cleanText(rawDetails, "Report details", 600, false);
  const relationship = await relationshipBetween(ownerUserId, buddyUserId);
  await getD1RuntimeDatabase().prepare(`INSERT INTO study_buddy_reports(id,reporter_user_id,target_user_id,relationship_id,reason,details)
    VALUES(?1,?2,?3,?4,?5,?6)`).bind(crypto.randomUUID(), ownerUserId, buddyUserId, relationship?.id ?? null, reason, details || null).run();
  return { ok: true };
}
