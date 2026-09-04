import "server-only";

import { getHotD1Database } from "./runtime";
import type { HotD1Database } from "./runtime";

export type HotProfile = {
  user_id: string; display_name: string | null; avatar_url: string | null;
  ca_level: string | null; group_choice: string | null; attempt_key: string | null;
  timezone: string; daily_target_minutes: number | null;
  onboarding_completed_at: string | null;
};

export type HotTask = { id: string; title: string; notes: string | null; task_kind: string; subject_id: string | null; chapter_id: string | null; due_at: string; estimated_minutes: number; status: string; completed_at: string | null };
export type HotGoal = { id: string; title: string; description: string | null; due_date: string; status: string; completed_at: string | null };
export type HotCalendarEvent = { id: string; title: string; notes: string | null; starts_at: string; ends_at: string | null; all_day: number };
export type HotActivitySession = { id: string; subject_id: string | null; chapter_id: string | null; ended_at: string; duration_seconds: number };
export type HotProgressEvent = { id: string; chapter_id: string; stage: string; action: string; created_at: string; undone_at: string | null };
export type HotProgressState = { chapter_id: string; completed_at: string | null; revision_1_at: string | null; revision_2_at: string | null; test_1_at: string | null; test_2_at: string | null; updated_at: string | null };

const PROFILE_COLUMNS = "user_id,display_name,avatar_url,ca_level,group_choice,attempt_key,timezone,daily_target_minutes,onboarding_completed_at";
const TASK_COLUMNS = "id,title,notes,task_kind,subject_id,chapter_id,due_at,estimated_minutes,status,completed_at";
const GOAL_COLUMNS = "id,title,description,due_date,status,completed_at";
const EVENT_COLUMNS = "id,title,notes,starts_at,ends_at,all_day";
const PROGRESS_COLUMNS = "chapter_id,completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at,updated_at";
const ACTIVITY_SESSION_COLUMNS = "id,subject_id,chapter_id,ended_at,duration_seconds";
const ACTIVITY_EVENT_COLUMNS = "id,chapter_id,stage,action,created_at,undone_at";

export async function getHotProfile(userId: string, db = getHotD1Database()) {
  return db.prepare(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE user_id=?1 LIMIT 1`).bind(userId).first<HotProfile>();
}

export async function getHotPlannerRows(userId: string, db = getHotD1Database()) {
  const result = await db.batch([
    db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id=?1 AND status<>'cancelled' ORDER BY due_at ASC LIMIT 250`).bind(userId),
    db.prepare(`SELECT ${GOAL_COLUMNS} FROM goals WHERE user_id=?1 AND status<>'cancelled' ORDER BY due_date ASC LIMIT 100`).bind(userId),
  ]);
  return { tasks: (result[0]?.results ?? []) as HotTask[], goals: (result[1]?.results ?? []) as HotGoal[] };
}

export async function getHotCalendarRows(userId: string, start: string, end: string, db = getHotD1Database()) {
  const result = await db.batch([
    db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id=?1 AND due_at>=?2 AND due_at<?3 AND status<>'cancelled' ORDER BY due_at ASC LIMIT 250`).bind(userId,start,end),
    db.prepare(`SELECT ${GOAL_COLUMNS} FROM goals WHERE user_id=?1 AND due_date>=?2 AND due_date<?3 AND status<>'cancelled' ORDER BY due_date ASC LIMIT 100`).bind(userId,start.slice(0,10),end.slice(0,10)),
    db.prepare(`SELECT ${EVENT_COLUMNS} FROM user_calendar_events WHERE user_id=?1 AND starts_at>=?2 AND starts_at<?3 ORDER BY starts_at ASC LIMIT 250`).bind(userId,start,end),
  ]);
  return { tasks: (result[0]?.results ?? []) as HotTask[], goals: (result[1]?.results ?? []) as HotGoal[], events: (result[2]?.results ?? []) as HotCalendarEvent[] };
}

export async function getHotActivityRows(userId: string, limit = 40, db = getHotD1Database()) {
  const bounded = Math.max(1, Math.min(Math.floor(limit), 100));
  const result = await db.batch([
    db.prepare(`SELECT ${ACTIVITY_SESSION_COLUMNS} FROM study_sessions WHERE user_id=?1 ORDER BY ended_at DESC LIMIT ${bounded}`).bind(userId),
    db.prepare(`SELECT ${ACTIVITY_EVENT_COLUMNS} FROM progress_events WHERE user_id=?1 ORDER BY created_at DESC LIMIT ${bounded}`).bind(userId),
  ]);
  return { sessions: (result[0]?.results ?? []) as HotActivitySession[], progress: (result[1]?.results ?? []) as HotProgressEvent[] };
}

export async function getHotProgressRows(userId: string, chapterIds: string[], since?: string, db = getHotD1Database()) {
  if (!chapterIds.length) return { progress: [] as HotProgressState[], events: [] as HotProgressEvent[], weeklyEvents: [] as HotProgressEvent[] };
  const values = chapterIds.slice(0, 500);
  const placeholders = values.map((_, i) => `?${i + 2}`).join(",");
  const base = [userId, ...values];
  const statements = [
    db.prepare(`SELECT ${PROGRESS_COLUMNS} FROM chapter_progress WHERE user_id=?1 AND chapter_id IN (${placeholders})`).bind(...base),
    db.prepare(`SELECT ${ACTIVITY_EVENT_COLUMNS} FROM progress_events WHERE user_id=?1 AND chapter_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 120`).bind(...base),
  ];
  if (since) statements.push(db.prepare(`SELECT ${ACTIVITY_EVENT_COLUMNS} FROM progress_events WHERE user_id=?1 AND chapter_id IN (${placeholders}) AND created_at>=?${values.length + 2} ORDER BY created_at DESC LIMIT 1000`).bind(...base, since));
  const result = await db.batch(statements);
  return {
    progress: (result[0]?.results ?? []) as HotProgressState[],
    events: (result[1]?.results ?? []) as HotProgressEvent[],
    weeklyEvents: (result[2]?.results ?? []) as HotProgressEvent[],
  };
}

export async function getHotDashboardProgress(userId: string, chapterIds: string[], db = getHotD1Database()) {
  if (!chapterIds.length) return [] as HotProgressState[];
  const values = chapterIds.slice(0, 500);
  const placeholders = values.map((_, i) => `?${i + 2}`).join(",");
  const result = await db.prepare(`SELECT ${PROGRESS_COLUMNS} FROM chapter_progress WHERE user_id=?1 AND chapter_id IN (${placeholders})`).bind(userId, ...values).all<HotProgressState>();
  return (result.results ?? []) as HotProgressState[];
}

export type HotNoteRow = { id: string; user_id: string; title: string; body_text: string; body_html: string; subject_id: string | null; chapter_id: string | null; visibility: string; moderation_status: string; owner_label: string; updated_at: string; published_at: string | null };
export type HotUploadRow = { id: string; owner_user_id: string; title: string; description: string | null; original_filename: string; mime_type: string; extension: string; size_bytes: number; subject_id: string | null; chapter_id: string | null; visibility: string; moderation_status: string; owner_label: string; updated_at: string; published_at: string | null };

export async function getHotResourceLibraryRows(userId: string, db = getHotD1Database()) {
  const result = await db.batch([
    db.prepare("SELECT id,user_id,title,body_text,body_html,subject_id,chapter_id,visibility,moderation_status,owner_label,updated_at,published_at FROM notes WHERE user_id=?1 ORDER BY updated_at DESC LIMIT 250").bind(userId),
    db.prepare("SELECT id,owner_user_id,title,description,original_filename,mime_type,extension,size_bytes,subject_id,chapter_id,visibility,moderation_status,owner_label,updated_at,published_at FROM uploaded_resources WHERE owner_user_id=?1 ORDER BY updated_at DESC LIMIT 250").bind(userId),
    db.prepare("SELECT id,user_id,title,body_text,body_html,subject_id,chapter_id,visibility,moderation_status,owner_label,updated_at,published_at FROM notes WHERE visibility='shared' AND moderation_status='approved' AND user_id<>?1 ORDER BY published_at DESC LIMIT 150").bind(userId),
    db.prepare("SELECT id,owner_user_id,title,description,original_filename,mime_type,extension,size_bytes,subject_id,chapter_id,visibility,moderation_status,owner_label,updated_at,published_at FROM uploaded_resources WHERE visibility='shared' AND moderation_status='approved' AND owner_user_id<>?1 ORDER BY published_at DESC LIMIT 150").bind(userId),
  ]);
  return {
    ownNotes: (result[0]?.results ?? []) as HotNoteRow[],
    ownUploads: (result[1]?.results ?? []) as HotUploadRow[],
    sharedNotes: (result[2]?.results ?? []) as HotNoteRow[],
    sharedUploads: (result[3]?.results ?? []) as HotUploadRow[],
  };
}

export type HotExamEvent = { id: string; attempt_id: string; title: string; event_type: string; event_date: string; source_url: string | null; last_seen_at: string | null; verification_status: string };

export async function getHotExamEvents(attemptKey: string, startDate: string, endDate: string, db = getHotD1Database()) {
  const rows = await db.prepare("SELECT ee.id,ee.attempt_id,ee.title,ee.event_type,ee.event_date,ee.source_url,ee.last_seen_at,ee.verification_status FROM exam_events ee JOIN exam_attempts ea ON ea.id=ee.attempt_id WHERE ea.attempt_key=?1 AND ea.verification_status='verified' AND ee.verification_status='verified' AND ee.event_date>=?2 AND ee.event_date<?3 ORDER BY ee.event_date LIMIT 100").bind(attemptKey,startDate.slice(0,10),endDate.slice(0,10)).all<HotExamEvent>();
  return (rows.results ?? []) as HotExamEvent[];
}

export async function getHotResourceDetail(resourceId: string, db = getHotD1Database()) {
  return db.prepare("SELECT id,owner_user_id,title,description,original_filename,mime_type,extension,size_bytes,subject_id,chapter_id,visibility,moderation_status,owner_label,updated_at,published_at FROM uploaded_resources WHERE id=?1 LIMIT 1").bind(resourceId).first<HotUploadRow>();
}

export type HotStudySession = { id: string; subject_id: string | null; chapter_id: string | null; started_at: string; ended_at: string; duration_seconds: number; mode: string; timezone: string };
export type HotTimerState = { status: string; mode: string; subject_id: string | null; chapter_id: string | null; focus_target_seconds: number; break_target_seconds: number; started_at: string | null; running_since: string | null; elapsed_seconds: number; paused_at: string | null; timezone: string; last_interaction_at: string };

export async function getHotStudySessions(userId: string, since: string, limit = 600, db = getHotD1Database()) {
  const bounded = Math.max(1, Math.min(Math.floor(limit), 600));
  return ((await db.prepare(`SELECT id,subject_id,chapter_id,started_at,ended_at,duration_seconds,mode,timezone FROM study_sessions WHERE user_id=?1 AND ended_at>=?2 ORDER BY ended_at DESC LIMIT ${bounded}`).bind(userId, since).all<HotStudySession>()).results ?? []) as HotStudySession[];
}

export async function getHotStudyTimer(userId: string, db = getHotD1Database()) {
  return db.prepare("SELECT status,mode,subject_id,chapter_id,focus_target_seconds,break_target_seconds,started_at,running_since,elapsed_seconds,paused_at,timezone,last_interaction_at FROM study_timer_state WHERE user_id=?1 LIMIT 1").bind(userId).first<HotTimerState>();
}

export type HotCommunityChannel = { id: string; channel_key: string; slug: string; scope_type: string; channel_kind: string; title: string; description: string; level_id: string | null; subject_id: string | null; write_policy: string; sort_order: number; is_active: number };
export type HotCommunityMessage = { id: string; sequence_id: number; channel_id: string; user_id: string; author_label: string; body: string; created_at: string; moderation_status: string; reply_to_message_id: string | null; attached_resource_id: string | null };

export type HotAcademicLevel = { id: string; code: string; name: string; is_active: number };
export type HotAcademicGroup = { id: string; level_id: string; code: string; name: string; is_active: number; sort_order: number };
export type HotAcademicSubject = { id: string; level_id: string; group_id: string; title: string; slug: string; is_active: number; sort_order: number };
export type HotAttemptMap = { level_id: string; attempt_key: string; group_id: string; subject_id: string; syllabus_version_id: string };
export type HotChapter = { id: string; syllabus_version_id: string; sort_order: number };

export async function getHotAcademicReference(levelCode: string, attemptKey: string, db = getHotD1Database()) {
  const level = await db.prepare("SELECT id,code,name,is_active FROM course_levels WHERE code=?1 AND is_active=1 LIMIT 1").bind(levelCode).first<HotAcademicLevel>();
  if (!level) return null;
  const result = await db.batch([
    db.prepare("SELECT id,level_id,code,name,is_active,sort_order FROM course_groups WHERE level_id=?1 AND is_active=1 ORDER BY sort_order").bind(level.id),
    db.prepare("SELECT id,level_id,group_id,title,slug,is_active,sort_order FROM subjects WHERE level_id=?1 AND is_active=1 ORDER BY sort_order").bind(level.id),
    db.prepare("SELECT level_id,attempt_key,group_id,subject_id,syllabus_version_id FROM attempt_syllabus_map WHERE level_id=?1 AND attempt_key=?2").bind(level.id, attemptKey),
  ]);
  const groups = (result[0]?.results ?? []) as HotAcademicGroup[];
  const subjects = (result[1]?.results ?? []) as HotAcademicSubject[];
  const maps = (result[2]?.results ?? []) as HotAttemptMap[];
  const versionIds = [...new Set(maps.map((row) => row.syllabus_version_id))];
  const chapters = versionIds.length
    ? ((await db.prepare(`SELECT id,syllabus_version_id,sort_order FROM chapters WHERE syllabus_version_id IN (${versionIds.map((_, index) => `?${index + 1}`).join(",")}) ORDER BY sort_order`).bind(...versionIds).all<HotChapter>()).results ?? [])
    : [];
  return { level, groups, subjects, maps, chapters };
}

export type HotCommunityListRow = HotCommunityChannel & { can_write: number; unread_count: number; latest_sequence: number | null; latest_body: string | null; latest_author: string | null; latest_at: string | null };

export async function getHotCommunityChannels(userId: string | null, db = getHotD1Database()) {
  const rows = await db.prepare(`SELECT cc.id,cc.channel_key,cc.slug,cc.scope_type,cc.channel_kind,cc.title,cc.description,cc.level_id,cc.subject_id,cc.write_policy,cc.sort_order,cc.is_active,
    CASE WHEN ?1 IS NOT NULL AND cc.write_policy IN ('members','all') THEN 1 ELSE 0 END AS can_write,
    COALESCE((SELECT COUNT(*) FROM community_messages m LEFT JOIN channel_read_state rs ON rs.channel_id=m.channel_id AND rs.user_id=?1 WHERE m.channel_id=cc.id AND m.moderation_status='active' AND (rs.last_read_sequence IS NULL OR m.sequence_id>rs.last_read_sequence)),0) AS unread_count,
    (SELECT MAX(m.sequence_id) FROM community_messages m WHERE m.channel_id=cc.id AND m.moderation_status='active') AS latest_sequence,
    (SELECT m.body FROM community_messages m WHERE m.channel_id=cc.id AND m.moderation_status='active' ORDER BY m.sequence_id DESC LIMIT 1) AS latest_body,
    (SELECT m.author_label FROM community_messages m WHERE m.channel_id=cc.id AND m.moderation_status='active' ORDER BY m.sequence_id DESC LIMIT 1) AS latest_author,
    (SELECT m.created_at FROM community_messages m WHERE m.channel_id=cc.id AND m.moderation_status='active' ORDER BY m.sequence_id DESC LIMIT 1) AS latest_at
    FROM community_channels cc
    WHERE cc.is_active=1
      AND (cc.scope_type='global' OR (?1 IS NOT NULL AND (
        (cc.scope_type='level' AND cc.level_id=(SELECT l.id FROM profiles p JOIN course_levels l ON l.code=p.ca_level WHERE p.user_id=?1 LIMIT 1))
        OR (cc.scope_type='subject' AND cc.subject_id IN (
          SELECT asm.subject_id FROM profiles p JOIN course_levels l ON l.code=p.ca_level
          JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key
          WHERE p.user_id=?1
        ))
      )))
    ORDER BY cc.sort_order,cc.title`).bind(userId).all<HotCommunityListRow>();
  return (rows.results ?? []) as HotCommunityListRow[];
}


const COMMUNITY_EMOJIS = ["👍", "❤️", "🎯", "👏", "💡", "✅"] as const;
const COMMUNITY_REPORT_REASONS = ["spam", "harassment", "misinformation", "off_topic", "other"] as const;
const COMMUNITY_MODERATOR_ROLES = ["moderator", "admin", "owner", "parent_owner"] as const;

function communityError(message: string): never {
  throw new Error(message);
}

async function visibleCommunityChannel(slug: string, userId: string, db: HotD1Database = getHotD1Database()) {
  const channel = await db.prepare(`SELECT id,channel_key,slug,scope_type,channel_kind,title,description,level_id,subject_id,write_policy,sort_order,is_active
    FROM community_channels cc WHERE cc.slug=?1 AND cc.is_active=1
      AND (cc.scope_type='global' OR
        (cc.scope_type='level' AND cc.level_id=(SELECT l.id FROM profiles p JOIN course_levels l ON l.code=p.ca_level WHERE p.user_id=?2 LIMIT 1)) OR
        (cc.scope_type='subject' AND cc.subject_id IN (
          SELECT asm.subject_id FROM profiles p JOIN course_levels l ON l.code=p.ca_level
          JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key WHERE p.user_id=?2
        ))) LIMIT 1`).bind(slug, userId).first<HotCommunityChannel>();
  if (!channel) communityError("Channel not found or access denied.");
  return channel;
}

async function visibleCommunityMessage(messageId: string, userId: string, db: HotD1Database = getHotD1Database()) {
  const message = await db.prepare(`SELECT m.id,m.sequence_id,m.channel_id,m.user_id,m.author_label,m.body,m.created_at,m.moderation_status,m.reply_to_message_id,m.attached_resource_id,
      cc.channel_key,cc.slug,cc.write_policy FROM community_messages m JOIN community_channels cc ON cc.id=m.channel_id
    WHERE m.id=?1 AND m.moderation_status IN ('active','moderated') AND cc.is_active=1
      AND (cc.scope_type='global' OR
        (cc.scope_type='level' AND cc.level_id=(SELECT l.id FROM profiles p JOIN course_levels l ON l.code=p.ca_level WHERE p.user_id=?2 LIMIT 1)) OR
        (cc.scope_type='subject' AND cc.subject_id IN (
          SELECT asm.subject_id FROM profiles p JOIN course_levels l ON l.code=p.ca_level
          JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key WHERE p.user_id=?2
        ))) LIMIT 1`).bind(messageId, userId).first<HotCommunityMessage & { channel_key: string; slug: string; write_policy: string }>();
  if (!message) communityError("Message not found or access denied.");
  return message;
}

export async function createHotCommunityMessage(input: {
  channelSlug: string; userId: string; authorLabel: string; body: string;
  replyToId?: string | null; resourceId?: string | null; mentionUserIds?: string[];
}, db: HotD1Database = getHotD1Database()) {
  const channel = await visibleCommunityChannel(input.channelSlug, input.userId, db);
  if (!["members", "all"].includes(channel.write_policy)) communityError("You cannot write in this channel.");
  const blocked = await db.prepare(`SELECT 1 AS blocked FROM chat_blocks WHERE user_id=?1 AND (channel_id IS NULL OR channel_id=?2) AND ends_at>datetime('now') LIMIT 1`).bind(input.userId, channel.id).first<{ blocked: number }>();
  if (blocked) communityError("You are temporarily blocked from this channel.");
  const body = input.body.trim().replace(/\s+/g, " ");
  if (body.length < 1 || body.length > 2000) communityError("Message must be between 1 and 2000 characters.");
  const recent = await db.prepare(`SELECT COUNT(*) AS count FROM community_messages WHERE user_id=?1 AND created_at>=datetime('now','-60 seconds')`).bind(input.userId).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 12) communityError("Message rate limit exceeded.");
  const duplicate = await db.prepare(`SELECT 1 AS duplicate FROM community_messages WHERE channel_id=?1 AND user_id=?2 AND body=?3 AND created_at>=datetime('now','-90 seconds') LIMIT 1`).bind(channel.id, input.userId, body).first<{ duplicate: number }>();
  if (duplicate) communityError("Duplicate message rejected.");
  if (input.replyToId) {
    const reply = await db.prepare(`SELECT 1 AS valid FROM community_messages WHERE id=?1 AND channel_id=?2 AND moderation_status='active' LIMIT 1`).bind(input.replyToId, channel.id).first<{ valid: number }>();
    if (!reply) communityError("Reply target is unavailable.");
  }
  if (input.resourceId) {
    const resource = await db.prepare(`SELECT 1 AS valid FROM uploaded_resources WHERE id=?1 AND visibility='shared' AND moderation_status='approved' LIMIT 1`).bind(input.resourceId).first<{ valid: number }>();
    if (!resource) communityError("Attachment is unavailable.");
  }
  const id = crypto.randomUUID();
  const sequence = await db.prepare(`SELECT COALESCE(MAX(sequence_id),0)+1 AS next_sequence FROM community_messages WHERE channel_id=?1`).bind(channel.id).first<{ next_sequence: number }>();
  const mentionIds = [...new Set((input.mentionUserIds ?? []).filter(Boolean))].slice(0, 10);
  const statements = [
    db.prepare(`INSERT INTO community_messages (id,sequence_id,channel_id,user_id,author_label,body,reply_to_message_id,attached_resource_id,moderation_status)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'active')`).bind(id, Number(sequence?.next_sequence ?? 1), channel.id, input.userId, input.authorLabel || "Student", body, input.replyToId ?? null, input.resourceId ?? null),
  ];
  for (const mentionedUserId of mentionIds) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO community_message_mentions (message_id,user_id) VALUES (?1,?2)`).bind(id, mentionedUserId));
    statements.push(db.prepare(`INSERT INTO community_notifications (id,user_id,channel_id,message_id,notification_type) VALUES (?1,?2,?3,?4,'mention')`).bind(crypto.randomUUID(), mentionedUserId, channel.id, id));
  }
  if (input.replyToId) {
    statements.push(db.prepare(`INSERT INTO community_notifications (id,user_id,channel_id,message_id,notification_type)
      SELECT ?1,user_id,?2,?3,'reply' FROM community_messages WHERE id=?4 AND user_id<>?5`).bind(crypto.randomUUID(), channel.id, id, input.replyToId, input.userId));
  }
  await db.batch(statements);
  return { id, sequence: Number(sequence?.next_sequence ?? 1) };
}

export async function markHotCommunityRead(channelSlug: string, userId: string, sequence?: number | null, db: HotD1Database = getHotD1Database()) {
  const channel = await visibleCommunityChannel(channelSlug, userId, db);
  const maxRow = await db.prepare(`SELECT COALESCE(MAX(sequence_id),0) AS max_sequence FROM community_messages WHERE channel_id=?1 AND moderation_status='active'`).bind(channel.id).first<{ max_sequence: number }>();
  const requested = sequence == null ? Number(maxRow?.max_sequence ?? 0) : Math.max(0, Math.min(Number(sequence), Number(maxRow?.max_sequence ?? 0)));
  await db.batch([
    db.prepare(`INSERT INTO channel_read_state (channel_id,user_id,last_read_sequence,last_read_at)
      VALUES (?1,?2,?3,CURRENT_TIMESTAMP)
      ON CONFLICT(channel_id,user_id) DO UPDATE SET last_read_sequence=MAX(channel_read_state.last_read_sequence,excluded.last_read_sequence),
        last_read_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(channel.id, userId, requested),
    db.prepare(`UPDATE community_notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE user_id=?1 AND channel_id=?2
      AND message_id IN (SELECT id FROM community_messages WHERE channel_id=?2 AND sequence_id<=?3)`).bind(userId, channel.id, requested),
  ]);
  return { channelId: channel.id, lastReadSequence: requested };
}

export async function toggleHotCommunityReaction(messageId: string, userId: string, emoji: string, db: HotD1Database = getHotD1Database()) {
  if (!(COMMUNITY_EMOJIS as readonly string[]).includes(emoji)) communityError("Unsupported reaction.");
  const message = await visibleCommunityMessage(messageId, userId, db);
  const existing = await db.prepare(`SELECT 1 AS present FROM message_reactions WHERE message_id=?1 AND user_id=?2 AND emoji=?3 LIMIT 1`).bind(message.id, userId, emoji).first<{ present: number }>();
  if (existing) {
    await db.prepare(`DELETE FROM message_reactions WHERE message_id=?1 AND user_id=?2 AND emoji=?3`).bind(message.id, userId, emoji).run();
    return { reacted: false };
  }
  await db.prepare(`INSERT INTO message_reactions (message_id,channel_id,user_id,emoji) VALUES (?1,?2,?3,?4)`).bind(message.id, message.channel_id, userId, emoji).run();
  return { reacted: true };
}

export async function reportHotCommunityMessage(messageId: string, userId: string, reason: string, details?: string | null, db: HotD1Database = getHotD1Database()) {
  if (!(COMMUNITY_REPORT_REASONS as readonly string[]).includes(reason)) communityError("Unsupported report reason.");
  const message = await visibleCommunityMessage(messageId, userId, db);
  const cleanDetails = details?.trim().slice(0, 1000) || null;
  const existing = await db.prepare(`SELECT id FROM message_reports WHERE message_id=?1 AND reporter_user_id=?2 LIMIT 1`).bind(message.id, userId).first<{ id: string }>();
  if (existing) {
    await db.prepare(`UPDATE message_reports SET channel_id=?1,reason=?2,details=?3,status='open',reviewed_by=NULL,reviewed_at=NULL WHERE id=?4`).bind(message.channel_id, reason, cleanDetails, existing.id).run();
    return { id: existing.id, status: "open" };
  }
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO message_reports (id,message_id,channel_id,reporter_user_id,reason,details,status) VALUES (?1,?2,?3,?4,?5,?6,'open')`).bind(id, message.id, message.channel_id, userId, reason, cleanDetails).run();
  return { id, status: "open" };
}

export async function moderateHotCommunity(input: {
  actorUserId: string; actorRole: string; action: string; messageId?: string | null;
  reportId?: string | null; targetUserId?: string | null; channelId?: string | null;
  reason?: string | null; durationMinutes?: number | null;
}, db: HotD1Database = getHotD1Database()) {
  if (!(COMMUNITY_MODERATOR_ROLES as readonly string[]).includes(input.actorRole)) communityError("Moderator access required.");
  const reason = input.reason?.trim().slice(0, 500) || null;
  const allowedActions = ["delete_message","restore_message","pin","unpin","block","unblock","dismiss_report","resolve_report"];
  if (!allowedActions.includes(input.action)) communityError("Unsupported moderation action.");
  const message = input.messageId ? await db.prepare(`SELECT id,channel_id,user_id,moderation_status FROM community_messages WHERE id=?1 LIMIT 1`).bind(input.messageId).first<{ id: string; channel_id: string; user_id: string; moderation_status: string }>() : null;
  const channelId = input.channelId ?? message?.channel_id ?? null;
  if (message && input.channelId && input.channelId !== message.channel_id) communityError("Message and channel do not match.");
  if (["delete_message","restore_message","pin","unpin"].includes(input.action) && !message) communityError("Message is required.");
  if (["block","unblock"].includes(input.action) && !input.targetUserId) communityError("Target user is required.");
  if (["dismiss_report","resolve_report"].includes(input.action) && !input.reportId) communityError("Report is required.");
  if (input.action === "pin" && message?.moderation_status !== "active") communityError("Only active messages can be pinned.");
  if (input.action === "block" && ![60,480,1440,2880].includes(Number(input.durationMinutes))) communityError("Invalid block duration.");
  const auditId = crypto.randomUUID();
  const statements = [];
  if (input.action === "delete_message") statements.push(db.prepare(`UPDATE community_messages SET moderation_status='moderated',deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(message!.id));
  if (input.action === "restore_message") statements.push(db.prepare(`UPDATE community_messages SET moderation_status='active',deleted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(message!.id));
  if (input.action === "pin") statements.push(db.prepare(`INSERT OR IGNORE INTO pinned_messages (channel_id,message_id,pinned_by) VALUES (?1,?2,?3)`).bind(channelId, message!.id, input.actorUserId));
  if (input.action === "unpin") statements.push(db.prepare(`DELETE FROM pinned_messages WHERE channel_id=?1 AND message_id=?2`).bind(channelId, message!.id));
  if (input.action === "block") statements.push(db.prepare(`INSERT INTO chat_blocks (id,user_id,channel_id,blocked_by,reason,starts_at,ends_at)
    VALUES (?1,?2,?3,?4,?5,CURRENT_TIMESTAMP,datetime('now','+' || ?6 || ' minutes'))`).bind(crypto.randomUUID(), input.targetUserId, channelId, input.actorUserId, reason ?? "Community moderation", Number(input.durationMinutes)));
  if (input.action === "unblock") statements.push(db.prepare(`UPDATE chat_blocks SET ends_at=CURRENT_TIMESTAMP WHERE user_id=?1 AND (?2 IS NULL OR channel_id=?2) AND ends_at>CURRENT_TIMESTAMP`).bind(input.targetUserId, channelId));
  if (input.action === "dismiss_report" || input.action === "resolve_report") statements.push(db.prepare(`UPDATE message_reports SET status=?1,reviewed_by=?2,reviewed_at=CURRENT_TIMESTAMP WHERE id=?3`).bind(input.action === "dismiss_report" ? "dismissed" : "actioned", input.actorUserId, input.reportId));
  if (input.reportId && ["delete_message","block"].includes(input.action)) statements.push(db.prepare(`UPDATE message_reports SET status='actioned',reviewed_by=?1,reviewed_at=CURRENT_TIMESTAMP WHERE id=?2`).bind(input.actorUserId, input.reportId));
  statements.push(db.prepare(`INSERT INTO moderation_actions (id,actor_user_id,actor_role,action_type,target_user_id,channel_id,message_id,report_id,reason,metadata)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`).bind(auditId, input.actorUserId, input.actorRole, input.action, input.targetUserId ?? message?.user_id ?? null, channelId, message?.id ?? null, input.reportId ?? null, reason, JSON.stringify({ durationMinutes: input.durationMinutes ?? null })));
  await db.batch(statements);
  return { id: auditId, action: input.action };
}

export async function getHotCommunityChannel(slug: string, db = getHotD1Database()) {
  return db.prepare(`SELECT id,channel_key,slug,scope_type,channel_kind,title,description,level_id,subject_id,write_policy,sort_order,is_active FROM community_channels WHERE slug=?1 AND is_active=1 LIMIT 1`).bind(slug).first<HotCommunityChannel>();
}

export async function getHotCommunityMessages(channelId: string, cursor?: number | null, query?: string | null, limit = 40, db = getHotD1Database()) {
  const bounded = Math.max(1, Math.min(Math.floor(limit), 100));
  const values: unknown[] = [channelId];
  const filters = ["channel_id=?1", "moderation_status IN ('active','moderated')"];
  if (Number.isSafeInteger(cursor) && Number(cursor) > 0) { values.push(cursor); filters.push(`sequence_id<?${values.length}`); }
  const search = query?.trim().slice(0, 80);
  if (search) { values.push(`%${search}%`); filters.push(`body LIKE ?${values.length}`); }
  const rows = await db.prepare(`SELECT id,sequence_id,channel_id,user_id,author_label,body,created_at,moderation_status,reply_to_message_id,attached_resource_id FROM community_messages WHERE ${filters.join(" AND ")} ORDER BY sequence_id DESC LIMIT ${bounded + 1}`).bind(...values).all<HotCommunityMessage>();
  return rows.results ?? [];
}


async function assertHotAcademicSelection(userId: string, subjectId: string | null, chapterId: string | null, db: HotD1Database) {
  if (subjectId) {
    const row = await db.prepare(`SELECT 1 AS valid FROM profiles p JOIN course_levels l ON l.code=p.ca_level
      JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key AND asm.subject_id=?1
      JOIN course_groups g ON g.id=asm.group_id WHERE p.user_id=?2 AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice) LIMIT 1`).bind(subjectId,userId).first();
    if (!row) throw new Error("Selected subject is not applicable.");
  }
  if (chapterId) {
    const row = await db.prepare(`SELECT c.id,sv.subject_id FROM profiles p JOIN course_levels l ON l.code=p.ca_level
      JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key
      JOIN chapters c ON c.syllabus_version_id=asm.syllabus_version_id JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id
      WHERE p.user_id=?1 AND c.id=?2 AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR asm.group_id IN (SELECT id FROM course_groups WHERE code=p.group_choice)) LIMIT 1`).bind(userId,chapterId).first<{id:string;subject_id:string}>();
    if (!row || (subjectId && row.subject_id !== subjectId)) throw new Error("Selected chapter is not applicable.");
  }
}

export async function saveHotNote(input: { id: string|null; userId: string; ownerLabel: string; title: string; bodyHtml: string; bodyText: string; subjectId: string|null; chapterId: string|null; tags: string[]; visibility: "private"|"shared" }, db: HotD1Database = getHotD1Database()) {
  if (!input.title || input.title.length > 160) throw new Error("A note title is required.");
  if (new TextEncoder().encode(input.bodyHtml).length > 200000 || new TextEncoder().encode(input.bodyText).length > 120000) throw new Error("Note content is too large.");
  if (input.tags.length > 12) throw new Error("A note can have at most 12 tags.");
  await assertHotAcademicSelection(input.userId,input.subjectId,input.chapterId,db);
  const id=input.id ?? crypto.randomUUID();
  const existing=input.id ? await db.prepare("SELECT id FROM notes WHERE id=?1 AND user_id=?2 LIMIT 1").bind(input.id,input.userId).first() : null;
  if (input.id && !existing) throw new Error("Note not found.");
  const status=input.visibility==="shared"?"pending":"private";
  const statements=[existing
    ? db.prepare("UPDATE notes SET title=?1,body_html=?2,body_text=?3,subject_id=?4,chapter_id=?5,visibility=?6,moderation_status=?7,published_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?8 AND user_id=?9").bind(input.title,input.bodyHtml,input.bodyText,input.subjectId,input.chapterId,input.visibility,status,id,input.userId)
    : db.prepare("INSERT INTO notes (id,user_id,owner_label,title,body_html,body_text,subject_id,chapter_id,visibility,moderation_status,published_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,NULL)").bind(id,input.userId,input.ownerLabel||"CA Progress student",input.title,input.bodyHtml,input.bodyText,input.subjectId,input.chapterId,input.visibility,status),
    db.prepare("DELETE FROM note_tag_map WHERE note_id=?1 AND user_id=?2").bind(id,input.userId)];
  for (const tag of [...new Set(input.tags.map((v)=>v.trim().slice(0,32).toLowerCase()).filter(Boolean))]) {
    const tagId=crypto.randomUUID();
    statements.push(db.prepare("INSERT INTO note_tags (id,user_id,name,normalized_name) VALUES (?1,?2,?3,?4) ON CONFLICT(user_id,normalized_name) DO UPDATE SET name=excluded.name").bind(tagId,input.userId,tag,tag));
    statements.push(db.prepare("INSERT OR IGNORE INTO note_tag_map (note_id,tag_id,user_id) SELECT ?1,id,?2 FROM note_tags WHERE user_id=?2 AND normalized_name=?3").bind(id,input.userId,tag));
  }
  await db.batch(statements); return {id,status};
}
export async function deleteHotNote(id:string,userId:string,db:HotD1Database=getHotD1Database()){ await db.prepare("DELETE FROM notes WHERE id=?1 AND user_id=?2").bind(id,userId).run(); return {ok:true}; }
export async function patchHotResource(input:{id:string;userId:string;title:string;description:string|null;subjectId:string|null;chapterId:string|null;visibility:"private"|"shared"},db:HotD1Database=getHotD1Database()){
  if(!input.title||input.title.length>160) throw new Error("A resource title is required.");
  await assertHotAcademicSelection(input.userId,input.subjectId,input.chapterId,db);
  const row=await db.prepare("SELECT id FROM uploaded_resources WHERE id=?1 AND owner_user_id=?2 LIMIT 1").bind(input.id,input.userId).first(); if(!row) throw new Error("Resource not found.");
  const status=input.visibility==="shared"?"pending":"private";
  await db.prepare("UPDATE uploaded_resources SET title=?1,description=?2,subject_id=?3,chapter_id=?4,visibility=?5,moderation_status=?6,published_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?7 AND owner_user_id=?8").bind(input.title,input.description,input.subjectId,input.chapterId,input.visibility,status,input.id,input.userId).run();
  return {id:input.id,status};
}
export async function getHotOwnedResource(id:string,userId:string,db:HotD1Database=getHotD1Database()){return db.prepare("SELECT id,owner_user_id,storage_bucket,storage_path FROM uploaded_resources WHERE id=?1 AND owner_user_id=?2 LIMIT 1").bind(id,userId).first<{id:string;owner_user_id:string;storage_bucket:string;storage_path:string}>();}
export async function deleteHotResource(id:string,userId:string,db:HotD1Database=getHotD1Database()){await db.prepare("DELETE FROM uploaded_resources WHERE id=?1 AND owner_user_id=?2").bind(id,userId).run();return {ok:true};}
export async function reportHotResource(input:{entityType:"note"|"upload";entityId:string;userId:string;reason:string;details:string|null},db:HotD1Database=getHotD1Database()){
  if(!["spam","misleading","copyright","unsafe","other"].includes(input.reason)) throw new Error("Unknown report reason.");
  const table=input.entityType==="note"?"notes":"uploaded_resources", owner=input.entityType==="note"?"user_id":"owner_user_id";
  const row=await db.prepare(`SELECT id,${owner} AS owner_id,moderation_status,visibility FROM ${table} WHERE id=?1 LIMIT 1`).bind(input.entityId).first<{id:string;owner_id:string;moderation_status:string;visibility:string}>();
  if(!row||row.visibility!=="shared"||row.moderation_status!=="approved") throw new Error("Only approved shared resources can be reported.");
  if(row.owner_id===input.userId) throw new Error("You cannot report your own resource.");
  const id=crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO resource_reports (id,entity_type,note_id,uploaded_resource_id,reporter_user_id,reason,details,status) VALUES (?1,?2,?3,?4,?5,?6,?7,'open')").bind(id,input.entityType,input.entityType==="note"?input.entityId:null,input.entityType==="upload"?input.entityId:null,input.userId,input.reason,input.details),
    db.prepare(`UPDATE ${table} SET moderation_status='reported',updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(input.entityId)]);
  return {id,status:"reported"};
}
function validateHotTask(input:{title:string;notes:string|null;taskKind:string;subjectId:string|null;chapterId:string|null;dueAt:string;estimatedMinutes:number}){if(!input.title||input.title.length>160||!["study","revision","test","other"].includes(input.taskKind)||!Number.isFinite(Date.parse(input.dueAt))||!Number.isFinite(input.estimatedMinutes)||input.estimatedMinutes<1||input.estimatedMinutes>720)throw new Error("Check the task title, date, type and estimated minutes.");}
export async function createHotTask(userId:string,input:{title:string;notes:string|null;taskKind:string;subjectId:string|null;chapterId:string|null;dueAt:string;estimatedMinutes:number},db:HotD1Database=getHotD1Database()){validateHotTask(input);await assertHotAcademicSelection(userId,input.subjectId,input.chapterId,db);const id=crypto.randomUUID();await db.prepare("INSERT INTO tasks (id,user_id,title,notes,task_kind,subject_id,chapter_id,due_at,estimated_minutes,status,completed_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'todo',NULL)").bind(id,userId,input.title,input.notes,input.taskKind,input.subjectId,input.chapterId,input.dueAt,input.estimatedMinutes).run();return {id,...input,status:"todo",completed_at:null};}
export async function updateHotTask(userId:string,id:string,input:{title:string;notes:string|null;taskKind:string;subjectId:string|null;chapterId:string|null;dueAt:string;estimatedMinutes:number},db:HotD1Database=getHotD1Database()){validateHotTask(input);await assertHotAcademicSelection(userId,input.subjectId,input.chapterId,db);await db.prepare("UPDATE tasks SET title=?1,notes=?2,task_kind=?3,subject_id=?4,chapter_id=?5,due_at=?6,estimated_minutes=?7,updated_at=CURRENT_TIMESTAMP WHERE id=?8 AND user_id=?9").bind(input.title,input.notes,input.taskKind,input.subjectId,input.chapterId,input.dueAt,input.estimatedMinutes,id,userId).run();return {ok:true};}
export async function toggleHotTask(userId:string,id:string,done:boolean,db:HotD1Database=getHotD1Database()){await db.prepare("UPDATE tasks SET status=?1,completed_at=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?3 AND user_id=?4").bind(done?"done":"todo",done?new Date().toISOString():null,id,userId).run();return {ok:true};}
export async function deleteHotTask(userId:string,id:string,db:HotD1Database=getHotD1Database()){await db.prepare("DELETE FROM tasks WHERE id=?1 AND user_id=?2").bind(id,userId).run();return {ok:true};}
export async function createHotGoal(userId:string,input:{title:string;description:string|null;dueDate:string},db:HotD1Database=getHotD1Database()){if(!input.title||input.title.length>160||!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate))throw new Error("Enter a goal title and valid due date.");const id=crypto.randomUUID();await db.prepare("INSERT INTO goals (id,user_id,title,description,due_date,status,completed_at) VALUES (?1,?2,?3,?4,?5,'active',NULL)").bind(id,userId,input.title,input.description,input.dueDate).run();return {id,...input,status:"active",completed_at:null};}
export async function toggleHotGoal(userId:string,id:string,done:boolean,db:HotD1Database=getHotD1Database()){await db.prepare("UPDATE goals SET status=?1,completed_at=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?3 AND user_id=?4").bind(done?"completed":"active",done?new Date().toISOString():null,id,userId).run();return {ok:true};}
export async function deleteHotGoal(userId:string,id:string,db:HotD1Database=getHotD1Database()){await db.prepare("DELETE FROM goals WHERE id=?1 AND user_id=?2").bind(id,userId).run();return {ok:true};}
async function validateHotEvent(input:{title:string;notes:string|null;startsAt:string;endsAt:string|null;allDay:boolean}){if(!input.title||input.title.length>160||!Number.isFinite(Date.parse(input.startsAt))||(input.endsAt&&!Number.isFinite(Date.parse(input.endsAt)))||(input.endsAt&&Date.parse(input.endsAt)<Date.parse(input.startsAt)))throw new Error("Check the event title and time range.");}
export async function createHotCalendarEvent(userId:string,input:{title:string;notes:string|null;startsAt:string;endsAt:string|null;allDay:boolean},db:HotD1Database=getHotD1Database()){await validateHotEvent(input);const id=crypto.randomUUID();await db.prepare("INSERT INTO user_calendar_events (id,user_id,title,notes,starts_at,ends_at,all_day) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(id,userId,input.title,input.notes,input.startsAt,input.endsAt,input.allDay?1:0).run();return {id,...input,user_id:userId,starts_at:input.startsAt,ends_at:input.endsAt,all_day:input.allDay?1:0};}
export async function updateHotCalendarEvent(userId:string,id:string,input:{title:string;notes:string|null;startsAt:string;endsAt:string|null;allDay:boolean},db:HotD1Database=getHotD1Database()){await validateHotEvent(input);await db.prepare("UPDATE user_calendar_events SET title=?1,notes=?2,starts_at=?3,ends_at=?4,all_day=?5,updated_at=CURRENT_TIMESTAMP WHERE id=?6 AND user_id=?7").bind(input.title,input.notes,input.startsAt,input.endsAt,input.allDay?1:0,id,userId).run();return {ok:true};}
export async function deleteHotCalendarEvent(userId:string,id:string,db:HotD1Database=getHotD1Database()){await db.prepare("DELETE FROM user_calendar_events WHERE id=?1 AND user_id=?2").bind(id,userId).run();return {ok:true};}

export async function moderateHotResource(input:{entityType:"note"|"upload";entityId:string;actorUserId:string;decision:"approve"|"reject";notes:string|null},db:HotD1Database=getHotD1Database()){
  const table=input.entityType==="note"?"notes":"uploaded_resources";
  const idColumn=input.entityType==="note"?"id":"id";
  const row=await db.prepare(`SELECT ${idColumn} AS id,moderation_status FROM ${table} WHERE id=?1 AND visibility='shared' LIMIT 1`).bind(input.entityId).first<{id:string;moderation_status:string}>();
  if(!row) throw new Error("Shared resource not found.");
  const to=input.decision==="approve"?"approved":"rejected";
  await db.batch([
    db.prepare(`UPDATE ${table} SET moderation_status=?1,published_at=${to==="approved"?"CURRENT_TIMESTAMP":"NULL"},updated_at=CURRENT_TIMESTAMP WHERE id=?2`).bind(to,input.entityId),
    db.prepare("INSERT INTO resource_moderation (id,entity_type,note_id,uploaded_resource_id,actor_user_id,action,from_status,to_status,notes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(crypto.randomUUID(),input.entityType,input.entityType==="note"?input.entityId:null,input.entityType==="upload"?input.entityId:null,input.actorUserId,input.decision,row.moderation_status,to,input.notes)
  ]);
  return {ok:true,status:to};
}

function hotProgressState(row: { completed_at?: string|null; revision_1_at?: string|null; revision_2_at?: string|null; test_1_at?: string|null; test_2_at?: string|null }|null) {
  return { completed_at: row?.completed_at ?? null, revision_1_at: row?.revision_1_at ?? null, revision_2_at: row?.revision_2_at ?? null, test_1_at: row?.test_1_at ?? null, test_2_at: row?.test_2_at ?? null };
}
function validateHotProgressState(state: ReturnType<typeof hotProgressState>) {
  if (state.revision_1_at && !state.completed_at) throw new Error("Revision 1 requires Completed first.");
  if (state.revision_2_at && !state.revision_1_at) throw new Error("Revision 2 requires Revision 1 first.");
  if (state.test_1_at && !state.completed_at) throw new Error("Test 1 requires Completed first.");
  if (state.test_2_at && !state.test_1_at) throw new Error("Test 2 requires Test 1 first.");
}
async function assertHotProgressChapter(userId: string, chapterId: string, db: HotD1Database) {
  const row = await db.prepare(`SELECT 1 AS valid FROM profiles p JOIN course_levels l ON l.code=p.ca_level
    JOIN chapters c ON c.id=?1 JOIN attempt_syllabus_map asm ON asm.syllabus_version_id=c.syllabus_version_id AND asm.level_id=l.id AND asm.attempt_key=p.attempt_key
    JOIN course_groups g ON g.id=asm.group_id WHERE p.user_id=?2 AND p.onboarding_completed_at IS NOT NULL
    AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice) LIMIT 1`).bind(chapterId,userId).first();
  if (!row) throw new Error("Chapter is not applicable to the current academic profile.");
}
export async function setHotProgressStage(userId:string,chapterId:string,stage:string,enabled:boolean,db:HotD1Database=getHotD1Database()){
  if(!["completed","revision_1","revision_2","test_1","test_2"].includes(stage)) throw new Error("Unknown progress stage.");
  await assertHotProgressChapter(userId,chapterId,db);
  await db.prepare("INSERT OR IGNORE INTO chapter_progress (user_id,chapter_id) VALUES (?1,?2)").bind(userId,chapterId).run();
  const row=await db.prepare("SELECT chapter_id,completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at,updated_at FROM chapter_progress WHERE user_id=?1 AND chapter_id=?2 LIMIT 1").bind(userId,chapterId).first<{chapter_id:string;completed_at:string|null;revision_1_at:string|null;revision_2_at:string|null;test_1_at:string|null;test_2_at:string|null;updated_at:string|null}>();
  const previous=hotProgressState(row);
  const next={...previous,[stage+"_at"]:enabled?new Date().toISOString():null};
  validateHotProgressState(next);
  const savedAt=new Date().toISOString();
  if(JSON.stringify(previous)===JSON.stringify(next)) return {chapter_id:chapterId,state:previous,event_id:null,saved_at:row?.updated_at??savedAt};
  const eventId=crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE chapter_progress SET completed_at=?1,revision_1_at=?2,revision_2_at=?3,test_1_at=?4,test_2_at=?5,updated_at=?6 WHERE user_id=?7 AND chapter_id=?8").bind(next.completed_at,next.revision_1_at,next.revision_2_at,next.test_1_at,next.test_2_at,savedAt,userId,chapterId),
    db.prepare("INSERT INTO progress_events (id,user_id,chapter_id,stage,action,previous_state,new_state) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(eventId,userId,chapterId,stage,enabled?"set":"clear",JSON.stringify(previous),JSON.stringify(next))
  ]);
  return {chapter_id:chapterId,state:next,event_id:eventId,saved_at:savedAt};
}
export async function undoHotProgressEvent(userId:string,eventId:string,db:HotD1Database=getHotD1Database()){
  const event=await db.prepare("SELECT id,chapter_id,stage,action,previous_state,new_state,reverts_event_id,undone_at FROM progress_events WHERE id=?1 AND user_id=?2 LIMIT 1").bind(eventId,userId).first<{id:string;chapter_id:string;stage:string;action:string;previous_state:string;new_state:string;reverts_event_id:string|null;undone_at:string|null}>();
  if(!event) throw new Error("Progress event not found.");
  if(event.action==="undo"||event.undone_at) throw new Error("This progress change cannot be undone again.");
  const row=await db.prepare("SELECT chapter_id,completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at,updated_at FROM chapter_progress WHERE user_id=?1 AND chapter_id=?2 LIMIT 1").bind(userId,event.chapter_id).first<{chapter_id:string;completed_at:string|null;revision_1_at:string|null;revision_2_at:string|null;test_1_at:string|null;test_2_at:string|null;updated_at:string|null}>();
  const current=hotProgressState(row);
  let previous: ReturnType<typeof hotProgressState>;
  let recorded: ReturnType<typeof hotProgressState>;
  try { previous=JSON.parse(event.previous_state) as ReturnType<typeof hotProgressState>; recorded=JSON.parse(event.new_state) as ReturnType<typeof hotProgressState>; } catch { throw new Error("Progress history is invalid."); }
  if(JSON.stringify(current)!==JSON.stringify(recorded)) throw new Error("Progress changed after this event; undo would overwrite a newer change.");
  validateHotProgressState(previous);
  const savedAt=new Date().toISOString();
  const undoId=crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE chapter_progress SET completed_at=?1,revision_1_at=?2,revision_2_at=?3,test_1_at=?4,test_2_at=?5,updated_at=?6 WHERE user_id=?7 AND chapter_id=?8").bind(previous.completed_at,previous.revision_1_at,previous.revision_2_at,previous.test_1_at,previous.test_2_at,savedAt,userId,event.chapter_id),
    db.prepare("INSERT INTO progress_events (id,user_id,chapter_id,stage,action,previous_state,new_state,reverts_event_id) VALUES (?1,?2,?3,?4,'undo',?5,?6,?7)").bind(undoId,userId,event.chapter_id,event.stage,JSON.stringify(current),JSON.stringify(previous),event.id),
    db.prepare("UPDATE progress_events SET undone_at=?1 WHERE id=?2 AND user_id=?3").bind(savedAt,event.id,userId)
  ]);
  return {chapter_id:event.chapter_id,state:previous,event_id:undoId,saved_at:savedAt,reverted_event_id:event.id};
}
