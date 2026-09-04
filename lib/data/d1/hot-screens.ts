import "server-only";

import { getHotD1Database } from "./runtime";

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
