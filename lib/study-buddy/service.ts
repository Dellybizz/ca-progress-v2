import "server-only";

import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { getStudyProfileForViewer } from "@/lib/profile/study-profile";
import {
  canonicalStudyBuddyPair,
  STUDY_BUDDY_NUDGE_MAX_PER_24H,
  STUDY_BUDDY_NUDGE_COOLDOWN_MS,
  STUDY_TOGETHER_INVITE_MAX_PER_24H,
  STUDY_TOGETHER_INVITE_COOLDOWN_MS,
  summarizeStudyBuddyGoal,
} from "./policy.mjs";

const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const REL_ID = /^[A-Za-z0-9-]{1,128}$/;
const NUDGE_KINDS = new Set(["start_studying", "keep_going", "weekly_goal"]);
const REPORT_CATEGORIES = new Set(["spam", "harassment", "privacy", "other"]);
const SHARING_FIELDS = ["shareProfile","shareProgress","shareStreak","shareLevel","shareAttempt","shareWeeklyGoal","shareStudyTogether"] as const;

type SharingField = typeof SHARING_FIELDS[number];
type RelationshipRow = { id:string; user_low_id:string; user_high_id:string; requester_user_id:string; status:string; accepted_at:string|null; ended_at:string|null; created_at:string; updated_at:string };
type SharingRow = { relationship_id:string; owner_user_id:string; share_profile:number; share_progress:number; share_streak:number; share_level:number; share_attempt:number; share_weekly_goal:number; share_study_together:number };
type GoalRow = { id:string; relationship_id:string; week_start:string; title:string; target_minutes:number; status:string; created_by_user_id:string; created_at:string; updated_at:string };
type ContributionRow = { goal_id:string; user_id:string; minutes:number };
type SessionRow = { id:string; relationship_id:string; inviter_user_id:string; invitee_user_id:string; goal_id:string|null; scheduled_for:string|null; planned_minutes:number; status:string; created_at:string; updated_at:string };

export class StudyBuddyInputError extends Error { constructor(message:string){ super(message); this.name="StudyBuddyInputError"; } }
export class StudyBuddyConflictError extends Error { constructor(message:string){ super(message); this.name="StudyBuddyConflictError"; } }
export class StudyBuddyRateLimitError extends Error { constructor(message:string){ super(message); this.name="StudyBuddyRateLimitError"; } }
export class StudyBuddyForbiddenError extends Error { constructor(message:string){ super(message); this.name="StudyBuddyForbiddenError"; } }

function userId(value: unknown, label = "user ID") {
  const id = typeof value === "string" ? value.trim() : "";
  if (!USER_ID.test(id)) throw new StudyBuddyInputError(`Invalid ${label}.`);
  return id;
}
function relationshipId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!REL_ID.test(id)) throw new StudyBuddyInputError("Invalid Study Buddy relationship.");
  return id;
}
function cleanText(value: unknown, max:number, label:string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new StudyBuddyInputError(`${label} must be 1-${max} characters.`);
  return text;
}
function wholeMinutes(value: unknown, min:number, max:number) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new StudyBuddyInputError(`Minutes must be between ${min} and ${max}.`);
  return n;
}
function weekStart(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new StudyBuddyInputError("Week start must be YYYY-MM-DD.");
  return key;
}
function otherUser(rel: RelationshipRow, actor:string) {
  if (rel.user_low_id === actor) return rel.user_high_id;
  if (rel.user_high_id === actor) return rel.user_low_id;
  throw new StudyBuddyForbiddenError("Study Buddy relationship unavailable.");
}
function sharingFromRow(row: SharingRow | null | undefined) {
  return {
    shareProfile: row?.share_profile === 1,
    shareProgress: row?.share_progress === 1,
    shareStreak: row?.share_streak === 1,
    shareLevel: row?.share_level === 1,
    shareAttempt: row?.share_attempt === 1,
    shareWeeklyGoal: row?.share_weekly_goal === 1,
    shareStudyTogether: row?.share_study_together === 1,
  };
}
async function relationForActor(actor:string, rawId:unknown, accepted = false) {
  const id = relationshipId(rawId);
  const row = await getD1RuntimeDatabase().prepare("SELECT * FROM study_buddy_relationships WHERE id=?1 AND (user_low_id=?2 OR user_high_id=?2) LIMIT 1").bind(id,actor).first<RelationshipRow>();
  if (!row || (accepted && row.status !== "accepted")) throw new StudyBuddyForbiddenError("Study Buddy relationship unavailable.");
  return row;
}
async function isBlocked(a:string,b:string) {
  const row = await getD1RuntimeDatabase().prepare("SELECT 1 AS ok FROM study_buddy_blocks WHERE (blocker_user_id=?1 AND blocked_user_id=?2) OR (blocker_user_id=?2 AND blocked_user_id=?1) LIMIT 1").bind(a,b).first<{ok:number}>();
  return Boolean(row);
}
async function assertCanInteract(rel:RelationshipRow, actor:string) {
  if (rel.status !== "accepted") throw new StudyBuddyForbiddenError("Study Buddy relationship unavailable.");
  const other = otherUser(rel,actor);
  if (await isBlocked(actor,other)) throw new StudyBuddyForbiddenError("Study Buddy interaction unavailable.");
  return other;
}
async function activeUserExists(id:string) {
  return Boolean(await getD1RuntimeDatabase().prepare("SELECT 1 AS ok FROM app_users WHERE user_id=?1 AND account_state='active' LIMIT 1").bind(id).first<{ok:number}>());
}

export async function requestStudyBuddy(actorUserId:string, rawTarget:unknown) {
  const target = userId(rawTarget,"Study Buddy user ID");
  if (target === actorUserId) throw new StudyBuddyInputError("You cannot send a Study Buddy request to yourself.");
  if (!(await activeUserExists(target))) throw new StudyBuddyInputError("That Study Buddy account was not found.");
  if (await isBlocked(actorUserId,target)) throw new StudyBuddyForbiddenError("Study Buddy request unavailable.");
  const [low,high] = canonicalStudyBuddyPair(actorUserId,target);
  const db = getD1RuntimeDatabase();
  const existing = await db.prepare("SELECT * FROM study_buddy_relationships WHERE user_low_id=?1 AND user_high_id=?2 LIMIT 1").bind(low,high).first<RelationshipRow>();
  if (existing?.status === "pending") throw new StudyBuddyConflictError("A Study Buddy request is already pending.");
  if (existing?.status === "accepted") throw new StudyBuddyConflictError("You are already Study Buddies.");
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db.prepare("UPDATE study_buddy_relationships SET requester_user_id=?2,status='pending',accepted_at=NULL,ended_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(id,actorUserId).run();
  } else {
    await db.prepare("INSERT INTO study_buddy_relationships(id,user_low_id,user_high_id,requester_user_id,status) VALUES(?1,?2,?3,?4,'pending')").bind(id,low,high,actorUserId).run();
  }
  return { id, targetUserId: target, status:"pending" as const };
}

export async function respondStudyBuddyRequest(actorUserId:string, rawRelationshipId:unknown, decision:unknown) {
  if (decision !== "accept" && decision !== "reject") throw new StudyBuddyInputError("Request response must be accept or reject.");
  const rel = await relationForActor(actorUserId,rawRelationshipId);
  if (rel.status !== "pending" || rel.requester_user_id === actorUserId) throw new StudyBuddyForbiddenError("Study Buddy request unavailable.");
  const other = otherUser(rel,actorUserId);
  if (await isBlocked(actorUserId,other)) throw new StudyBuddyForbiddenError("Study Buddy request unavailable.");
  const db = getD1RuntimeDatabase();
  if (decision === "reject") {
    await db.prepare("UPDATE study_buddy_relationships SET status='rejected',ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='pending'").bind(rel.id).run();
    return { id:rel.id, status:"rejected" as const };
  }
  await db.batch([
    db.prepare("UPDATE study_buddy_relationships SET status='accepted',accepted_at=CURRENT_TIMESTAMP,ended_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='pending'").bind(rel.id),
    db.prepare("INSERT OR IGNORE INTO study_buddy_sharing(relationship_id,owner_user_id) VALUES(?1,?2)").bind(rel.id,rel.user_low_id),
    db.prepare("INSERT OR IGNORE INTO study_buddy_sharing(relationship_id,owner_user_id) VALUES(?1,?2)").bind(rel.id,rel.user_high_id),
    db.prepare("INSERT OR IGNORE INTO study_profile_buddies(owner_user_id,buddy_user_id) VALUES(?1,?2)").bind(rel.user_low_id,rel.user_high_id),
    db.prepare("INSERT OR IGNORE INTO study_profile_buddies(owner_user_id,buddy_user_id) VALUES(?1,?2)").bind(rel.user_high_id,rel.user_low_id),
  ]);
  return { id:rel.id, status:"accepted" as const };
}

export async function removeStudyBuddy(actorUserId:string, rawRelationshipId:unknown) {
  const rel = await relationForActor(actorUserId,rawRelationshipId,true);
  const db = getD1RuntimeDatabase();
  await db.batch([
    db.prepare("UPDATE study_buddy_relationships SET status='removed',ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(rel.id),
    db.prepare("DELETE FROM study_profile_buddies WHERE owner_user_id=?1 AND buddy_user_id=?2").bind(rel.user_low_id,rel.user_high_id),
    db.prepare("DELETE FROM study_profile_buddies WHERE owner_user_id=?1 AND buddy_user_id=?2").bind(rel.user_high_id,rel.user_low_id),
    db.prepare("UPDATE study_together_sessions SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE relationship_id=?1 AND status IN ('invited','accepted')").bind(rel.id),
  ]);
  return { id:rel.id, status:"removed" as const };
}

export async function saveStudyBuddySharing(actorUserId:string, rawRelationshipId:unknown, input:Record<string,unknown>) {
  const rel = await relationForActor(actorUserId,rawRelationshipId,true);
  await assertCanInteract(rel,actorUserId);
  for (const field of SHARING_FIELDS) if (typeof input[field] !== "boolean") throw new StudyBuddyInputError(`${field} must be true or false.`);
  const values = SHARING_FIELDS.map((field) => input[field] ? 1 : 0);
  await getD1RuntimeDatabase().prepare(`INSERT INTO study_buddy_sharing(relationship_id,owner_user_id,share_profile,share_progress,share_streak,share_level,share_attempt,share_weekly_goal,share_study_together)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
    ON CONFLICT(relationship_id,owner_user_id) DO UPDATE SET share_profile=excluded.share_profile,share_progress=excluded.share_progress,share_streak=excluded.share_streak,share_level=excluded.share_level,share_attempt=excluded.share_attempt,share_weekly_goal=excluded.share_weekly_goal,share_study_together=excluded.share_study_together,updated_at=CURRENT_TIMESTAMP`)
    .bind(rel.id,actorUserId,...values).run();
  return sharingFromRow({ relationship_id:rel.id, owner_user_id:actorUserId, share_profile:values[0], share_progress:values[1], share_streak:values[2], share_level:values[3], share_attempt:values[4], share_weekly_goal:values[5], share_study_together:values[6] });
}

async function interactionRate(table:string, relationshipIdValue:string, actor:string, max:number, cooldownMs:number) {
  const db = getD1RuntimeDatabase();
  const senderColumn = table === "study_buddy_nudges" ? "sender_user_id" : "inviter_user_id";
  const rows = await db.prepare(`SELECT created_at FROM ${table} WHERE relationship_id=?1 AND ${senderColumn}=?2 AND created_at>=datetime('now','-24 hours') ORDER BY created_at DESC`).bind(relationshipIdValue,actor).all<{created_at:string}>();
  const events = rows.results ?? [];
  if (events.length >= max) throw new StudyBuddyRateLimitError("Daily Study Buddy interaction limit reached.");
  if (events[0] && Date.now() - new Date(events[0].created_at).getTime() < cooldownMs) throw new StudyBuddyRateLimitError("Study Buddy interaction is cooling down.");
}
async function muteRow(owner:string,target:string) {
  return getD1RuntimeDatabase().prepare("SELECT mute_nudges,mute_invitations FROM study_buddy_mutes WHERE owner_user_id=?1 AND muted_user_id=?2 LIMIT 1").bind(owner,target).first<{mute_nudges:number;mute_invitations:number}>();
}

export async function sendStudyBuddyNudge(actorUserId:string, rawRelationshipId:unknown, kind:unknown) {
  const rel = await relationForActor(actorUserId,rawRelationshipId,true);
  const recipient = await assertCanInteract(rel,actorUserId);
  if (typeof kind !== "string" || !NUDGE_KINDS.has(kind)) throw new StudyBuddyInputError("Invalid nudge type.");
  if ((await muteRow(recipient,actorUserId))?.mute_nudges === 1) throw new StudyBuddyForbiddenError("Study Buddy interaction unavailable.");
  await interactionRate("study_buddy_nudges",rel.id,actorUserId,STUDY_BUDDY_NUDGE_MAX_PER_24H,STUDY_BUDDY_NUDGE_COOLDOWN_MS);
  const id = crypto.randomUUID();
  await getD1RuntimeDatabase().prepare("INSERT INTO study_buddy_nudges(id,relationship_id,sender_user_id,recipient_user_id,kind) VALUES(?1,?2,?3,?4,?5)").bind(id,rel.id,actorUserId,recipient,kind).run();
  return { id, kind, status:"unread" as const };
}

export async function updateStudyBuddyNudge(actorUserId:string, rawNudgeId:unknown, status:unknown) {
  const id = relationshipId(rawNudgeId);
  if (status !== "read" && status !== "dismissed") throw new StudyBuddyInputError("Nudge status must be read or dismissed.");
  const row = await getD1RuntimeDatabase().prepare("SELECT recipient_user_id FROM study_buddy_nudges WHERE id=?1 LIMIT 1").bind(id).first<{recipient_user_id:string}>();
  if (!row || row.recipient_user_id !== actorUserId) throw new StudyBuddyForbiddenError("Nudge unavailable.");
  await getD1RuntimeDatabase().prepare("UPDATE study_buddy_nudges SET status=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(id,status).run();
  return { id, status };
}

export async function createStudyBuddyWeeklyGoal(actorUserId:string, rawRelationshipId:unknown, input:Record<string,unknown>) {
  const rel = await relationForActor(actorUserId,rawRelationshipId,true); await assertCanInteract(rel,actorUserId);
  const title = cleanText(input.title,80,"Goal title"); const start = weekStart(input.weekStart); const target = wholeMinutes(input.targetMinutes,1,10080);
  const id = crypto.randomUUID();
  try { await getD1RuntimeDatabase().prepare("INSERT INTO study_buddy_weekly_goals(id,relationship_id,week_start,title,target_minutes,created_by_user_id) VALUES(?1,?2,?3,?4,?5,?6)").bind(id,rel.id,start,title,target,actorUserId).run(); }
  catch { throw new StudyBuddyConflictError("This Study Buddy pair already has a goal for that week."); }
  return { id, relationshipId:rel.id, weekStart:start, title, targetMinutes:target, status:"active" as const };
}

export async function addStudyBuddyGoalContribution(actorUserId:string, rawGoalId:unknown, input:Record<string,unknown>) {
  const goalId = relationshipId(rawGoalId); const minutes = wholeMinutes(input.minutes,1,1440);
  const db = getD1RuntimeDatabase();
  const goal = await db.prepare("SELECT g.*,r.user_low_id,r.user_high_id,r.status AS relationship_status FROM study_buddy_weekly_goals g JOIN study_buddy_relationships r ON r.id=g.relationship_id WHERE g.id=?1 LIMIT 1").bind(goalId).first<GoalRow & {user_low_id:string;user_high_id:string;relationship_status:string}>();
  if (!goal || goal.relationship_status !== "accepted" || ![goal.user_low_id,goal.user_high_id].includes(actorUserId)) throw new StudyBuddyForbiddenError("Shared goal unavailable.");
  if (await isBlocked(goal.user_low_id,goal.user_high_id)) throw new StudyBuddyForbiddenError("Shared goal unavailable.");
  const sourceKey = typeof input.sourceKey === "string" && input.sourceKey.trim() ? input.sourceKey.trim().slice(0,128) : crypto.randomUUID();
  await db.prepare("INSERT OR IGNORE INTO study_buddy_goal_contributions(id,goal_id,user_id,source_type,source_key,minutes) VALUES(?1,?2,?3,'manual',?4,?5)").bind(crypto.randomUUID(),goalId,actorUserId,sourceKey,minutes).run();
  return goalSummary(goalId);
}

async function goalSummary(goalId:string) {
  const db = getD1RuntimeDatabase();
  const goal = await db.prepare("SELECT * FROM study_buddy_weekly_goals WHERE id=?1 LIMIT 1").bind(goalId).first<GoalRow>();
  if (!goal) throw new StudyBuddyInputError("Shared goal not found.");
  const rows = await db.prepare("SELECT user_id,minutes FROM study_buddy_goal_contributions WHERE goal_id=?1").bind(goalId).all<{user_id:string;minutes:number}>();
  return { ...goal, summary:summarizeStudyBuddyGoal((rows.results ?? []).map((row)=>({userId:row.user_id,minutes:Number(row.minutes)})),Number(goal.target_minutes)) };
}

export async function inviteStudyTogether(actorUserId:string, rawRelationshipId:unknown, input:Record<string,unknown>) {
  const rel = await relationForActor(actorUserId,rawRelationshipId,true); const recipient = await assertCanInteract(rel,actorUserId);
  if ((await muteRow(recipient,actorUserId))?.mute_invitations === 1) throw new StudyBuddyForbiddenError("Study Together invitation unavailable.");
  await interactionRate("study_together_sessions",rel.id,actorUserId,STUDY_TOGETHER_INVITE_MAX_PER_24H,STUDY_TOGETHER_INVITE_COOLDOWN_MS);
  const planned = wholeMinutes(input.plannedMinutes,5,480);
  const goalId = input.goalId == null || input.goalId === "" ? null : relationshipId(input.goalId);
  if (goalId) {
    const goal = await getD1RuntimeDatabase().prepare("SELECT 1 AS ok FROM study_buddy_weekly_goals WHERE id=?1 AND relationship_id=?2 AND status='active' LIMIT 1").bind(goalId,rel.id).first<{ok:number}>();
    if (!goal) throw new StudyBuddyInputError("Shared goal is not available for this Study Together session.");
  }
  let scheduledFor:string|null = null;
  if (input.scheduledFor) { const date = new Date(String(input.scheduledFor)); if (!Number.isFinite(date.getTime())) throw new StudyBuddyInputError("Invalid Study Together schedule."); scheduledFor = date.toISOString(); }
  const id = crypto.randomUUID();
  await getD1RuntimeDatabase().prepare("INSERT INTO study_together_sessions(id,relationship_id,inviter_user_id,invitee_user_id,goal_id,scheduled_for,planned_minutes) VALUES(?1,?2,?3,?4,?5,?6,?7)").bind(id,rel.id,actorUserId,recipient,goalId,scheduledFor,planned).run();
  return { id, status:"invited" as const, plannedMinutes:planned };
}

export async function respondStudyTogether(actorUserId:string, rawSessionId:unknown, decision:unknown) {
  const id=relationshipId(rawSessionId); if(decision!=="accept"&&decision!=="decline") throw new StudyBuddyInputError("Invitation response must be accept or decline.");
  const db=getD1RuntimeDatabase(); const session=await db.prepare("SELECT * FROM study_together_sessions WHERE id=?1 LIMIT 1").bind(id).first<SessionRow>();
  if(!session||session.invitee_user_id!==actorUserId||session.status!=="invited") throw new StudyBuddyForbiddenError("Study Together invitation unavailable.");
  const rel=await relationForActor(actorUserId,session.relationship_id,true); await assertCanInteract(rel,actorUserId);
  const status=decision==="accept"?"accepted":"declined";
  await db.prepare("UPDATE study_together_sessions SET status=?2,responded_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='invited'").bind(id,status).run();
  return {id,status};
}

export async function cancelStudyTogether(actorUserId:string, rawSessionId:unknown) {
  const id=relationshipId(rawSessionId); const db=getD1RuntimeDatabase(); const session=await db.prepare("SELECT * FROM study_together_sessions WHERE id=?1 LIMIT 1").bind(id).first<SessionRow>();
  if(!session||![session.inviter_user_id,session.invitee_user_id].includes(actorUserId)||!["invited","accepted"].includes(session.status)) throw new StudyBuddyForbiddenError("Study Together session unavailable.");
  await db.prepare("UPDATE study_together_sessions SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(id).run(); return {id,status:"cancelled" as const};
}

export async function completeStudyTogether(actorUserId:string, rawSessionId:unknown, rawMinutes:unknown) {
  const id=relationshipId(rawSessionId); const minutes=wholeMinutes(rawMinutes,1,480); const db=getD1RuntimeDatabase();
  const session=await db.prepare("SELECT * FROM study_together_sessions WHERE id=?1 LIMIT 1").bind(id).first<SessionRow>();
  if(!session||session.status!=="accepted"||![session.inviter_user_id,session.invitee_user_id].includes(actorUserId)) throw new StudyBuddyForbiddenError("Study Together session is not completable.");
  const rel=await relationForActor(actorUserId,session.relationship_id,true); await assertCanInteract(rel,actorUserId);
  await db.prepare("INSERT OR IGNORE INTO study_together_completions(session_id,user_id,minutes) VALUES(?1,?2,?3)").bind(id,actorUserId,minutes).run();
  const completions=await db.prepare("SELECT user_id,minutes FROM study_together_completions WHERE session_id=?1 AND user_id IN (?2,?3)").bind(id,session.inviter_user_id,session.invitee_user_id).all<{user_id:string;minutes:number}>();
  const unique=new Map((completions.results??[]).map((row)=>[row.user_id,row]));
  if(unique.size===2){
    const statements=[db.prepare("UPDATE study_together_sessions SET status='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='accepted'").bind(id)];
    if(session.goal_id) for(const row of unique.values()) statements.push(db.prepare("INSERT OR IGNORE INTO study_buddy_goal_contributions(id,goal_id,user_id,source_type,source_key,minutes) VALUES(?1,?2,?3,'study_together',?4,?5)").bind(crypto.randomUUID(),session.goal_id,row.user_id,id,Number(row.minutes)));
    await db.batch(statements);
  }
  return {id,complete:unique.size===2,completionCount:unique.size,goal:session.goal_id&&unique.size===2?await goalSummary(session.goal_id):null};
}

export async function setStudyBuddyMute(actorUserId:string, rawTarget:unknown, input:Record<string,unknown>) {
  const target=userId(rawTarget,"Study Buddy user ID"); if(target===actorUserId) throw new StudyBuddyInputError("You cannot mute yourself.");
  if(typeof input.muteNudges!=="boolean"||typeof input.muteInvitations!=="boolean") throw new StudyBuddyInputError("Mute settings must be true or false.");
  const db=getD1RuntimeDatabase();
  await db.prepare(`INSERT INTO study_buddy_mutes(owner_user_id,muted_user_id,mute_nudges,mute_invitations) VALUES(?1,?2,?3,?4)
    ON CONFLICT(owner_user_id,muted_user_id) DO UPDATE SET mute_nudges=excluded.mute_nudges,mute_invitations=excluded.mute_invitations,updated_at=CURRENT_TIMESTAMP`).bind(actorUserId,target,input.muteNudges?1:0,input.muteInvitations?1:0).run();
  return {targetUserId:target,muteNudges:input.muteNudges,muteInvitations:input.muteInvitations};
}

export async function blockStudyBuddy(actorUserId:string, rawTarget:unknown) {
  const target=userId(rawTarget,"Study Buddy user ID"); if(target===actorUserId) throw new StudyBuddyInputError("You cannot block yourself."); const [low,high]=canonicalStudyBuddyPair(actorUserId,target); const db=getD1RuntimeDatabase();
  const rel=await db.prepare("SELECT * FROM study_buddy_relationships WHERE user_low_id=?1 AND user_high_id=?2 LIMIT 1").bind(low,high).first<RelationshipRow>();
  const stmts=[db.prepare("INSERT OR IGNORE INTO study_buddy_blocks(blocker_user_id,blocked_user_id) VALUES(?1,?2)").bind(actorUserId,target),db.prepare("DELETE FROM study_profile_buddies WHERE owner_user_id=?1 AND buddy_user_id=?2").bind(actorUserId,target),db.prepare("DELETE FROM study_profile_buddies WHERE owner_user_id=?1 AND buddy_user_id=?2").bind(target,actorUserId)];
  if(rel){ stmts.push(db.prepare("UPDATE study_buddy_relationships SET status='removed',ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(rel.id)); stmts.push(db.prepare("UPDATE study_together_sessions SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE relationship_id=?1 AND status IN ('invited','accepted')").bind(rel.id)); }
  await db.batch(stmts); return {targetUserId:target,blocked:true};
}
export async function unblockStudyBuddy(actorUserId:string, rawTarget:unknown) { const target=userId(rawTarget,"Study Buddy user ID"); await getD1RuntimeDatabase().prepare("DELETE FROM study_buddy_blocks WHERE blocker_user_id=?1 AND blocked_user_id=?2").bind(actorUserId,target).run(); return {targetUserId:target,blocked:false}; }

export async function reportStudyBuddy(actorUserId:string, rawTarget:unknown, input:Record<string,unknown>) {
  const target=userId(rawTarget,"Study Buddy user ID"); if(target===actorUserId) throw new StudyBuddyInputError("You cannot report yourself.");
  const category=typeof input.category==="string"?input.category:""; if(!REPORT_CATEGORIES.has(category)) throw new StudyBuddyInputError("Invalid report category.");
  const details=input.details==null?null:String(input.details).trim(); if(details&&details.length>500) throw new StudyBuddyInputError("Report details must be 500 characters or fewer.");
  const [low,high]=canonicalStudyBuddyPair(actorUserId,target); const db=getD1RuntimeDatabase(); const rel=await db.prepare("SELECT id FROM study_buddy_relationships WHERE user_low_id=?1 AND user_high_id=?2 LIMIT 1").bind(low,high).first<{id:string}>(); const id=crypto.randomUUID();
  await db.prepare("INSERT INTO study_buddy_reports(id,relationship_id,reporter_user_id,reported_user_id,category,details) VALUES(?1,?2,?3,?4,?5,?6)").bind(id,rel?.id??null,actorUserId,target,category,details||null).run();
  return {id,submitted:true};
}

export async function getStudyBuddyDashboard(userIdValue:string) {
  const actor=userId(userIdValue); const db=getD1RuntimeDatabase();
  const relResult=await db.prepare("SELECT * FROM study_buddy_relationships WHERE user_low_id=?1 OR user_high_id=?1 ORDER BY updated_at DESC LIMIT 100").bind(actor).all<RelationshipRow>();
  const relationships=relResult.results??[]; const accepted=relationships.filter((rel)=>rel.status==="accepted"); const acceptedIds=accepted.map((rel)=>rel.id);
  const sharingRows:SharingRow[]=[]; const goals:ReturnType<typeof Object>[]=[]; const sessions:SessionRow[]=[];
  for(const rel of accepted){
    const rows=await db.prepare("SELECT * FROM study_buddy_sharing WHERE relationship_id=?1").bind(rel.id).all<SharingRow>(); sharingRows.push(...(rows.results??[]));
    const goalRows=await db.prepare("SELECT * FROM study_buddy_weekly_goals WHERE relationship_id=?1 AND status!='archived' ORDER BY week_start DESC LIMIT 8").bind(rel.id).all<GoalRow>();
    for(const goal of goalRows.results??[]) goals.push(await goalSummary(goal.id));
    const sessionRows=await db.prepare("SELECT * FROM study_together_sessions WHERE relationship_id=?1 ORDER BY created_at DESC LIMIT 20").bind(rel.id).all<SessionRow>(); sessions.push(...(sessionRows.results??[]));
  }
  const sharingByKey=new Map(sharingRows.map((row)=>[`${row.relationship_id}:${row.owner_user_id}`,sharingFromRow(row)]));
  const buddies=await Promise.all(accepted.map(async(rel)=>{const buddyId=otherUser(rel,actor); return {relationshipId:rel.id,buddyUserId:buddyId,mySharing:sharingByKey.get(`${rel.id}:${actor}`)??sharingFromRow(null),theirSharing:sharingByKey.get(`${rel.id}:${buddyId}`)??sharingFromRow(null),profile:await getStudyProfileForViewer(buddyId,actor)};}));
  const nudgeRows=await db.prepare("SELECT id,relationship_id,sender_user_id,kind,status,created_at FROM study_buddy_nudges WHERE recipient_user_id=?1 AND status!='dismissed' ORDER BY created_at DESC LIMIT 50").bind(actor).all();
  const muteRows=await db.prepare("SELECT muted_user_id,mute_nudges,mute_invitations FROM study_buddy_mutes WHERE owner_user_id=?1").bind(actor).all<{muted_user_id:string;mute_nudges:number;mute_invitations:number}>();
  const blocks=await db.prepare("SELECT blocked_user_id FROM study_buddy_blocks WHERE blocker_user_id=?1").bind(actor).all<{blocked_user_id:string}>();
  return {
    requests:{incoming:relationships.filter((rel)=>rel.status==="pending"&&rel.requester_user_id!==actor).map((rel)=>({relationshipId:rel.id,userId:otherUser(rel,actor),createdAt:rel.created_at})),outgoing:relationships.filter((rel)=>rel.status==="pending"&&rel.requester_user_id===actor).map((rel)=>({relationshipId:rel.id,userId:otherUser(rel,actor),createdAt:rel.created_at}))},
    buddies, goals, studyTogether:sessions, nudges:nudgeRows.results??[], mutes:(muteRows.results??[]).map((row)=>({userId:row.muted_user_id,muteNudges:row.mute_nudges===1,muteInvitations:row.mute_invitations===1})), blockedUserIds:(blocks.results??[]).map((row)=>row.blocked_user_id), acceptedRelationshipIds:acceptedIds,
  };
}
