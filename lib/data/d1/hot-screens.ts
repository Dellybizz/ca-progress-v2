import "server-only";

import { getHotD1Database, type HotD1Database } from "./runtime";

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

export type HotCommunityChannel = { id: string; channel_key: string; slug: string; scope_type: string; channel_kind: string; title: string; description: string; level_id: string | null; subject_id: string | null; write_policy: string; sort_order: number; is_active: number };
export type HotCommunityMessage = { id: string; sequence_id: number; channel_id: string; user_id: string; author_label: string; body: string; created_at: string; moderation_status: string; reply_to_message_id: string | null; attached_resource_id: string | null };

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
