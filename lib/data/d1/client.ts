import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCloudflareRequestAuth } from "@/lib/auth/cloudflare";
import { logServerPerformance } from "@/lib/cloudflare/runtime-env";
import type { AppRole } from "@/lib/authorization/roles";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};
export type D1DatabaseLike = {
  prepare(query: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
};

type QueryError = { message: string; code?: string };
type QueryResult<T = unknown> = { data: T | null; error: QueryError | null };
type ClientOptions = { admin?: boolean; actorUserId?: string | null; actorRole?: AppRole | null };
type Filter = { sql: string; values: unknown[] };

type TableInfo = { name: string; type: string; notnull: number; dflt_value: unknown; pk: number };

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BOOLEAN_COLUMNS = new Set([
  "is_active", "is_default", "is_public", "all_day", "manual_override", "enabled", "checkout_enabled",
  "verified", "email_verified", "remember_device", "can_write", "is_required", "is_visible", "is_locked",
]);
const JSON_COLUMNS = new Set([
  "value", "metadata", "payload", "context", "previous_state", "new_state", "interval_days", "preferred_weekdays",
  "settings", "details", "data", "snapshot", "source_payload", "review_payload", "rules", "entitlements",
]);
const OWNER_COLUMN: Record<string, string> = {
  profiles: "user_id", user_preferences: "user_id", chapter_progress: "user_id", progress_events: "user_id",
  planner_events: "user_id", daily_plans: "user_id", daily_plan_items: "user_id", revision_rules: "user_id",
  revision_due_items: "user_id", tasks: "user_id", goals: "user_id", user_calendar_events: "user_id",
  dashboard_events: "user_id", forecast_snapshots: "user_id", study_sessions: "user_id", study_timer_state: "user_id",
  notes: "user_id", note_tags: "user_id", note_tag_map: "user_id", uploaded_resources: "owner_user_id",
  community_notifications: "user_id", message_reactions: "user_id", channel_read_state: "user_id",
  user_subscriptions: "user_id", payment_orders: "user_id", payment_events: "user_id", subscription_events: "user_id",
};
const INSERT_DEFAULTS: Record<string, Record<string, unknown>> = {
  revision_rules: { interval_days: [1, 7, 21], preferred_weekdays: [1, 2, 3, 4, 5, 6], revision_minutes: 45, new_chapter_minutes: 90, test_minutes: 60 },
};

const tableInfoCache = new Map<string, TableInfo[]>();

function ident(value: string) {
  if (!IDENTIFIER.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

function selectList(value: string) {
  const input = value.trim();
  if (input === "*") return "*";
  return input.split(",").map((part) => ident(part.trim())).join(",");
}

function encodeValue(value: unknown) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

function decodeRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (BOOLEAN_COLUMNS.has(key) && (value === 0 || value === 1)) out[key] = value === 1;
    if (JSON_COLUMNS.has(key) && typeof value === "string") {
      try { out[key] = JSON.parse(value); } catch { /* historical free text is kept as-is */ }
    }
  }
  return out as T;
}

function errorResult(error: unknown): QueryResult {
  const message = error instanceof Error ? error.message : "D1 query failed.";
  const code = /FOREIGN KEY|constraint|UNIQUE/i.test(message) ? "23505" : /auth|access|applicable|moderator/i.test(message) ? "42501" : undefined;
  return { data: null, error: { message, code } };
}

export function getD1RuntimeDatabase(): D1DatabaseLike {
  const { env } = getCloudflareContext();
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") throw new Error("Cloudflare D1 DB binding is required.");
  return db;
}

async function tableInfo(db: D1DatabaseLike, table: string) {
  const cached = tableInfoCache.get(table);
  if (cached) return cached;
  const result = await db.prepare(`PRAGMA table_info(${ident(table)})`).all<TableInfo>();
  const rows = result.results ?? [];
  if (!rows.length) throw new Error(`Unknown D1 table: ${table}`);
  tableInfoCache.set(table, rows);
  return rows;
}

function nowIso() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID(); }
function stateJson(row: Record<string, unknown> | null) {
  return {
    completed_at: row?.completed_at ?? null,
    revision_1_at: row?.revision_1_at ?? null,
    revision_2_at: row?.revision_2_at ?? null,
    test_1_at: row?.test_1_at ?? null,
    test_2_at: row?.test_2_at ?? null,
  };
}
function sameState(a: Record<string, unknown>, b: Record<string, unknown>) { return JSON.stringify(a) === JSON.stringify(b); }
function validateProgressState(state: Record<string, unknown>) {
  if (state.revision_1_at && !state.completed_at) throw new Error("Revision 1 requires Completed first.");
  if (state.revision_2_at && !state.revision_1_at) throw new Error("Revision 2 requires Revision 1 first.");
  if (state.test_1_at && !state.completed_at) throw new Error("Test 1 requires Completed first.");
  if (state.test_2_at && !state.test_1_at) throw new Error("Test 2 requires Test 1 first.");
}

async function userRole(db: D1DatabaseLike, userId: string | null) {
  if (!userId) return "student" as AppRole;
  const row = await db.prepare("SELECT role FROM app_users WHERE user_id=?1 LIMIT 1").bind(userId).first<{ role?: string }>();
  const role = row?.role;
  return role === "moderator" || role === "admin" || role === "owner" || role === "parent_owner" ? role : "student";
}
function privileged(role: AppRole | null | undefined) { return role === "moderator" || role === "admin" || role === "owner" || role === "parent_owner"; }

async function chapterApplicable(db: D1DatabaseLike, userId: string, chapterId: string) {
  const row = await db.prepare(`SELECT 1 AS ok FROM profiles p
    JOIN course_levels l ON l.code=p.ca_level
    JOIN chapters c ON c.id=?1
    JOIN attempt_syllabus_map asm ON asm.syllabus_version_id=c.syllabus_version_id AND asm.level_id=l.id AND asm.attempt_key=p.attempt_key
    JOIN course_groups g ON g.id=asm.group_id
    WHERE p.user_id=?2 AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice) LIMIT 1`).bind(chapterId, userId).first();
  return Boolean(row);
}
async function subjectApplicable(db: D1DatabaseLike, userId: string, subjectId: string) {
  const row = await db.prepare(`SELECT 1 AS ok FROM profiles p
    JOIN course_levels l ON l.code=p.ca_level
    JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key AND asm.subject_id=?1
    JOIN course_groups g ON g.id=asm.group_id
    WHERE p.user_id=?2 AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice) LIMIT 1`).bind(subjectId, userId).first();
  return Boolean(row);
}

function alignedDue(baseIso: string, days: number, weekdays: number[]) {
  const date = new Date(baseIso);
  date.setUTCDate(date.getUTCDate() + days);
  if (weekdays.length) {
    for (let i = 0; i < 7 && !weekdays.includes(date.getUTCDay()); i += 1) date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString();
}

async function rebuildRevisionSchedule(db: D1DatabaseLike, userId: string) {
  let rules = await db.prepare("SELECT * FROM revision_rules WHERE user_id=?1").bind(userId).first<Record<string, unknown>>();
  if (!rules) {
    await db.prepare("INSERT INTO revision_rules(user_id,interval_days,preferred_weekdays,revision_minutes,new_chapter_minutes,test_minutes) VALUES(?1,?2,?3,45,90,60)")
      .bind(userId, JSON.stringify([1,7,21]), JSON.stringify([1,2,3,4,5,6])).run();
    rules = await db.prepare("SELECT * FROM revision_rules WHERE user_id=?1").bind(userId).first<Record<string, unknown>>();
  }
  const intervals = typeof rules?.interval_days === "string" ? JSON.parse(rules.interval_days) as number[] : [1,7,21];
  const weekdays = typeof rules?.preferred_weekdays === "string" ? JSON.parse(rules.preferred_weekdays) as number[] : [1,2,3,4,5,6];
  const progress = (await db.prepare("SELECT * FROM chapter_progress WHERE user_id=?1 AND completed_at IS NOT NULL").bind(userId).all<Record<string, unknown>>()).results ?? [];
  for (const row of progress) {
    const completed = String(row.completed_at);
    for (let index = 0; index < intervals.length; index += 1) {
      const revision = index + 1;
      const existing = await db.prepare("SELECT id,status,manual_due_at,completed_at FROM revision_due_items WHERE user_id=?1 AND chapter_id=?2 AND revision_number=?3 AND source_completed_at=?4 LIMIT 1")
        .bind(userId, row.chapter_id, revision, completed).first<Record<string, unknown>>();
      const alreadyDone = (revision === 1 && row.revision_1_at) || (revision === 2 && row.revision_2_at);
      const status = existing?.status === "completed" || alreadyDone ? "completed" : "pending";
      const completedAt = status === "completed" ? (existing?.completed_at ?? nowIso()) : null;
      const due = alignedDue(completed, Number(intervals[index]), weekdays.map(Number));
      if (existing) {
        if (!existing.manual_due_at) await db.prepare("UPDATE revision_due_items SET due_at=?1,status=?2,completed_at=?3,updated_at=?4 WHERE id=?5")
          .bind(due, status, completedAt, nowIso(), existing.id).run();
      } else {
        await db.prepare("INSERT INTO revision_due_items(id,user_id,chapter_id,revision_number,source_completed_at,due_at,manual_due_at,status,completed_at) VALUES(?1,?2,?3,?4,?5,?6,NULL,?7,?8)")
          .bind(uuid(), userId, row.chapter_id, revision, completed, due, status, completedAt).run();
      }
    }
  }
}

async function progressSetStage(db: D1DatabaseLike, userId: string, args: Record<string, unknown>) {
  const chapterId = String(args.p_chapter_id ?? "");
  const stage = String(args.p_stage ?? "");
  const enabled = Boolean(args.p_enabled);
  if (!chapterId || !["completed","revision_1","revision_2","test_1","test_2"].includes(stage)) throw new Error("Unknown progress stage.");
  if (!(await chapterApplicable(db, userId, chapterId))) throw new Error("Chapter is not applicable to the current academic profile.");
  let row = await db.prepare("SELECT * FROM chapter_progress WHERE user_id=?1 AND chapter_id=?2").bind(userId, chapterId).first<Record<string, unknown>>();
  if (!row) {
    await db.prepare("INSERT INTO chapter_progress(user_id,chapter_id) VALUES(?1,?2)").bind(userId, chapterId).run();
    row = await db.prepare("SELECT * FROM chapter_progress WHERE user_id=?1 AND chapter_id=?2").bind(userId, chapterId).first<Record<string, unknown>>();
  }
  const previous = stateJson(row);
  const next = { ...previous, [`${stage}_at`]: enabled ? nowIso() : null };
  validateProgressState(next);
  if (sameState(previous, next)) return { chapter_id: chapterId, state: previous, event_id: null, saved_at: row?.updated_at ?? nowIso() };
  const savedAt = nowIso();
  const eventId = uuid();
  await db.batch([
    db.prepare("UPDATE chapter_progress SET completed_at=?1,revision_1_at=?2,revision_2_at=?3,test_1_at=?4,test_2_at=?5,updated_at=?6 WHERE user_id=?7 AND chapter_id=?8")
      .bind(next.completed_at,next.revision_1_at,next.revision_2_at,next.test_1_at,next.test_2_at,savedAt,userId,chapterId),
    db.prepare("INSERT INTO progress_events(id,user_id,chapter_id,action,stage,previous_state,new_state,reverts_event_id,undone_at,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,NULL,NULL,?8)")
      .bind(eventId,userId,chapterId,enabled?"set":"clear",stage,JSON.stringify(previous),JSON.stringify(next),savedAt),
    db.prepare("INSERT INTO planner_events(id,user_id,event_type,entity_type,entity_id,payload,created_at) VALUES(?1,?2,'progress_changed','chapter_progress',?3,?4,?5)")
      .bind(uuid(),userId,chapterId,JSON.stringify(next),savedAt),
  ]);
  await rebuildRevisionSchedule(db, userId);
  return { chapter_id: chapterId, state: next, event_id: eventId, saved_at: savedAt };
}

async function progressUndo(db: D1DatabaseLike, userId: string, args: Record<string, unknown>) {
  const eventId = String(args.p_event_id ?? "");
  const event = await db.prepare("SELECT * FROM progress_events WHERE id=?1 AND user_id=?2 LIMIT 1").bind(eventId,userId).first<Record<string, unknown>>();
  if (!event) throw new Error("Progress event not found.");
  if (event.action === "undo" || event.undone_at) throw new Error("This progress change cannot be undone again.");
  const row = await db.prepare("SELECT * FROM chapter_progress WHERE user_id=?1 AND chapter_id=?2").bind(userId,event.chapter_id).first<Record<string, unknown>>();
  if (!row) throw new Error("Current chapter progress was not found.");
  const current = stateJson(row);
  const previous = typeof event.previous_state === "string" ? JSON.parse(event.previous_state) as Record<string, unknown> : event.previous_state as Record<string, unknown>;
  const expected = typeof event.new_state === "string" ? JSON.parse(event.new_state) as Record<string, unknown> : event.new_state as Record<string, unknown>;
  if (!sameState(current, expected)) throw new Error("Progress changed after this event; undo would overwrite a newer change.");
  validateProgressState(previous);
  const undoId = uuid(); const savedAt = nowIso();
  await db.batch([
    db.prepare("UPDATE chapter_progress SET completed_at=?1,revision_1_at=?2,revision_2_at=?3,test_1_at=?4,test_2_at=?5,updated_at=?6 WHERE user_id=?7 AND chapter_id=?8")
      .bind(previous.completed_at,previous.revision_1_at,previous.revision_2_at,previous.test_1_at,previous.test_2_at,savedAt,userId,event.chapter_id),
    db.prepare("INSERT INTO progress_events(id,user_id,chapter_id,action,stage,previous_state,new_state,reverts_event_id,undone_at,created_at) VALUES(?1,?2,?3,'undo',?4,?5,?6,?7,NULL,?8)")
      .bind(undoId,userId,event.chapter_id,event.stage,JSON.stringify(current),JSON.stringify(previous),eventId,savedAt),
    db.prepare("UPDATE progress_events SET undone_at=?1 WHERE id=?2").bind(savedAt,eventId),
  ]);
  await rebuildRevisionSchedule(db, userId);
  return { chapter_id: event.chapter_id, state: previous, event_id: undoId, saved_at: savedAt, reverted_event_id: eventId };
}

function timerElapsed(row: Record<string, unknown>, now = new Date()) {
  const base = Number(row.elapsed_seconds ?? 0);
  const running = row.status === "running" && row.running_since ? Math.max(0, Math.floor((now.valueOf() - Date.parse(String(row.running_since))) / 1000)) : 0;
  return Math.min(43200, Math.max(0, base + running));
}

async function studyTimerRpc(db: D1DatabaseLike, userId: string, name: string, args: Record<string, unknown>) {
  const now = nowIso();
  if (name === "study_timer_start") {
    const subjectId = args.p_subject_id ? String(args.p_subject_id) : null;
    const chapterId = args.p_chapter_id ? String(args.p_chapter_id) : null;
    const mode = String(args.p_mode ?? "stopwatch");
    const focus = args.p_focus_target_seconds == null ? null : Number(args.p_focus_target_seconds);
    const rest = args.p_break_target_seconds == null ? null : Number(args.p_break_target_seconds);
    const timezone = String(args.p_timezone ?? "UTC");
    if (!["stopwatch","pomodoro"].includes(mode)) throw new Error("Unsupported timer mode.");
    try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date()); } catch { throw new Error("Unknown timezone."); }
    if (focus !== null && (focus < 60 || focus > 43200)) throw new Error("Focus duration must be between 1 minute and 12 hours.");
    if (rest !== null && (rest < 0 || rest > 7200)) throw new Error("Break duration is invalid.");
    if (subjectId && !(await subjectApplicable(db,userId,subjectId))) throw new Error("Subject is not applicable to the current academic profile.");
    if (chapterId && !(await chapterApplicable(db,userId,chapterId))) throw new Error("Chapter is not applicable to the current academic profile.");
    if (chapterId && subjectId) {
      const owner = await db.prepare("SELECT sv.subject_id FROM chapters c JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id WHERE c.id=?1").bind(chapterId).first<{subject_id:string}>();
      if (owner?.subject_id !== subjectId) throw new Error("Chapter does not belong to the selected subject.");
    }
    if (await db.prepare("SELECT 1 FROM study_timer_state WHERE user_id=?1").bind(userId).first()) throw new Error("A study timer is already active.");
    await db.prepare("INSERT INTO study_timer_state(user_id,subject_id,chapter_id,status,mode,timezone,started_at,running_since,paused_at,elapsed_seconds,focus_target_seconds,break_target_seconds,last_interaction_at) VALUES(?1,?2,?3,'running',?4,?5,?6,?6,NULL,0,?7,?8,?6)")
      .bind(userId,subjectId,chapterId,mode,timezone,now,focus,rest).run();
    return { status:"running", started_at:now, elapsed_seconds:0, saved_at:now };
  }
  const row = await db.prepare("SELECT * FROM study_timer_state WHERE user_id=?1").bind(userId).first<Record<string, unknown>>();
  if (name === "study_timer_touch") { if (row) await db.prepare("UPDATE study_timer_state SET last_interaction_at=?1,updated_at=?1 WHERE user_id=?2").bind(now,userId).run(); return null; }
  if (name === "study_timer_discard") { if (!row) throw new Error("No active study timer."); await db.prepare("DELETE FROM study_timer_state WHERE user_id=?1").bind(userId).run(); return { status:"discarded", saved_at:now }; }
  if (!row) throw new Error(name === "study_timer_resume" ? "No paused study timer." : "No active study timer.");
  if (name === "study_timer_pause") {
    if (row.status !== "running") throw new Error("Timer is already paused.");
    const elapsed = timerElapsed(row);
    await db.prepare("UPDATE study_timer_state SET status='paused',elapsed_seconds=?1,running_since=NULL,paused_at=?2,last_interaction_at=?2,updated_at=?2 WHERE user_id=?3").bind(elapsed,now,userId).run();
    return { status:"paused", elapsed_seconds:elapsed, saved_at:now };
  }
  if (name === "study_timer_resume") {
    if (row.status !== "paused") throw new Error("Timer is already running.");
    if (Number(row.elapsed_seconds) >= 43200) throw new Error("Timer reached the 12 hour safety limit. Finish or discard it.");
    await db.prepare("UPDATE study_timer_state SET status='running',running_since=?1,paused_at=NULL,last_interaction_at=?1,updated_at=?1 WHERE user_id=?2").bind(now,userId).run();
    return { status:"running", elapsed_seconds:Number(row.elapsed_seconds), running_since:now, saved_at:now };
  }
  if (name === "study_timer_finish") {
    const elapsed = timerElapsed(row);
    if (elapsed < 1) throw new Error("Study duration must be at least 1 second.");
    if (elapsed > 43200) throw new Error("Study duration exceeded the 12 hour safety limit.");
    if (Date.now() - Date.parse(String(row.last_interaction_at)) > 16*60*60*1000) throw new Error("This timer appears abandoned. Discard it instead of saving an inaccurate session.");
    const sessionId = uuid();
    await db.batch([
      db.prepare("INSERT INTO study_sessions(id,user_id,subject_id,chapter_id,mode,timezone,started_at,ended_at,duration_seconds,focus_target_seconds,break_target_seconds) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)")
        .bind(sessionId,userId,row.subject_id,row.chapter_id,row.mode,row.timezone,row.started_at,now,elapsed,row.focus_target_seconds,row.break_target_seconds),
      db.prepare("DELETE FROM study_timer_state WHERE user_id=?1").bind(userId),
      db.prepare("INSERT INTO planner_events(id,user_id,event_type,entity_type,entity_id,payload,created_at) VALUES(?1,?2,'study_session_changed','study_session',?3,?4,?5)")
        .bind(uuid(),userId,sessionId,JSON.stringify({duration_seconds:elapsed}),now),
    ]);
    return { status:"finished", session_id:sessionId, elapsed_seconds:elapsed, saved_at:now };
  }
  throw new Error(`Unsupported timer RPC: ${name}`);
}

async function saveNote(db: D1DatabaseLike, userId: string, args: Record<string, unknown>) {
  const noteId = args.p_note_id ? String(args.p_note_id) : uuid();
  const title = String(args.p_title ?? "").trim();
  const html = String(args.p_body_html ?? ""); const text = String(args.p_body_text ?? "");
  const visibility = String(args.p_visibility ?? "private");
  const subjectId = args.p_subject_id ? String(args.p_subject_id) : null; const chapterId = args.p_chapter_id ? String(args.p_chapter_id) : null;
  const tags = Array.isArray(args.p_tags) ? args.p_tags.map(String) : [];
  if (!title || title.length > 160) throw new Error("Note title is required and must be at most 160 characters.");
  if (new TextEncoder().encode(html).length > 200000 || new TextEncoder().encode(text).length > 120000) throw new Error("Note content is too large.");
  if (!["private","shared"].includes(visibility)) throw new Error("Unknown note visibility.");
  if (tags.length > 12) throw new Error("A note can have at most 12 tags.");
  if (subjectId && !(await subjectApplicable(db,userId,subjectId))) throw new Error("Subject is not applicable to the current academic profile.");
  if (chapterId && !(await chapterApplicable(db,userId,chapterId))) throw new Error("Chapter is not applicable to the current academic profile.");
  const profile = await db.prepare("SELECT display_name FROM profiles WHERE user_id=?1").bind(userId).first<{display_name:string|null}>();
  const ownerLabel = profile?.display_name?.trim() || "CA Progress student";
  const existing = await db.prepare("SELECT * FROM notes WHERE id=?1 AND user_id=?2").bind(noteId,userId).first<Record<string, unknown>>();
  const moderation = visibility === "private" ? "private" : existing?.visibility === "shared" && existing.moderation_status === "approved" && existing.title === title && existing.body_html === html && existing.subject_id === subjectId && existing.chapter_id === chapterId ? "approved" : "pending";
  const published = moderation === "approved" ? existing?.published_at ?? nowIso() : null;
  if (existing) await db.prepare("UPDATE notes SET title=?1,body_html=?2,body_text=?3,subject_id=?4,chapter_id=?5,visibility=?6,moderation_status=?7,published_at=?8,updated_at=?9 WHERE id=?10 AND user_id=?11")
    .bind(title,html,text,subjectId,chapterId,visibility,moderation,published,nowIso(),noteId,userId).run();
  else await db.prepare("INSERT INTO notes(id,user_id,owner_label,title,body_html,body_text,subject_id,chapter_id,visibility,moderation_status,published_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)")
    .bind(noteId,userId,ownerLabel,title,html,text,subjectId,chapterId,visibility,moderation,published).run();
  await db.prepare("DELETE FROM note_tag_map WHERE note_id=?1 AND user_id=?2").bind(noteId,userId).run();
  for (const raw of tags) {
    const name = raw.trim().slice(0,32); if (!name) continue; const normalized = name.toLowerCase();
    let tag = await db.prepare("SELECT id FROM note_tags WHERE user_id=?1 AND normalized_name=?2").bind(userId,normalized).first<{id:string}>();
    if (!tag) { const id=uuid(); await db.prepare("INSERT INTO note_tags(id,user_id,name,normalized_name) VALUES(?1,?2,?3,?4)").bind(id,userId,name,normalized).run(); tag={id}; }
    else await db.prepare("UPDATE note_tags SET name=?1 WHERE id=?2").bind(name,tag.id).run();
    await db.prepare("INSERT OR IGNORE INTO note_tag_map(note_id,tag_id,user_id) VALUES(?1,?2,?3)").bind(noteId,tag.id,userId).run();
  }
  return noteId;
}

async function channelVisible(db: D1DatabaseLike, userId: string, channel: Record<string, unknown>) {
  if (channel.scope_type === "global") return true;
  const profile = await db.prepare("SELECT ca_level,group_choice,attempt_key FROM profiles WHERE user_id=?1 AND onboarding_completed_at IS NOT NULL").bind(userId).first<Record<string, unknown>>();
  if (!profile) return false;
  const level = await db.prepare("SELECT id FROM course_levels WHERE code=?1").bind(profile.ca_level).first<{id:string}>();
  if (!level) return false;
  if (channel.scope_type === "level") return channel.level_id === level.id;
  if (channel.scope_type === "subject") {
    if (!channel.subject_id) return false;
    const row = await db.prepare("SELECT g.code FROM attempt_syllabus_map asm JOIN course_groups g ON g.id=asm.group_id WHERE asm.level_id=?1 AND asm.attempt_key=?2 AND asm.subject_id=?3 LIMIT 1")
      .bind(level.id,profile.attempt_key,channel.subject_id).first<{code:string}>();
    return Boolean(row && (profile.ca_level === "foundation" || profile.group_choice === "both" || profile.group_choice === "not_applicable" || row.code === profile.group_choice));
  }
  return false;
}

async function canWriteChannel(db: D1DatabaseLike, userId: string, role: AppRole, channel: Record<string, unknown>) {
  if (!(await channelVisible(db,userId,channel))) return false;
  const block = await db.prepare("SELECT 1 FROM chat_blocks WHERE user_id=?1 AND ends_at>?2 AND (channel_id IS NULL OR channel_id=?3) LIMIT 1").bind(userId,nowIso(),channel.id).first();
  if (block) return false;
  const policy = String(channel.write_policy ?? "members");
  if (policy === "moderators" || channel.channel_kind === "announcement") return privileged(role);
  if (policy === "read_only") return false;
  return true;
}

async function communityRpc(db: D1DatabaseLike, userId: string, role: AppRole, name: string, args: Record<string, unknown>) {
  if (name === "phase10_list_channels") {
    // One set-based read replaces the previous per-channel visibility/latest/read/write loop.
    const profile = await db.prepare("SELECT ca_level,group_choice,attempt_key FROM profiles WHERE user_id=?1 AND onboarding_completed_at IS NOT NULL").bind(userId).first<Record<string, unknown>>();
    const level = profile ? await db.prepare("SELECT id FROM course_levels WHERE code=?1").bind(profile.ca_level).first<{id:string}>() : null;
    const visibleSql = profile && level
      ? `(c.scope_type='global' OR (c.scope_type='level' AND c.level_id=?1) OR (c.scope_type='subject' AND EXISTS (
          SELECT 1 FROM attempt_syllabus_map asm
          JOIN course_groups g ON g.id=asm.group_id
          WHERE asm.level_id=?1 AND asm.attempt_key=?2 AND asm.subject_id=c.subject_id
            AND (?3 IN ('foundation') OR ?4 IN ('both','not_applicable') OR g.code=?4)
        )))`
      : "(c.scope_type='global')";
    const visibilityValues = profile && level ? [level.id, profile.attempt_key, profile.ca_level, profile.group_choice] : [];
    const privilegedFlag = privileged(role) ? 1 : 0;
    const rows = (await db.prepare(`
      SELECT c.*,
        (SELECT m.sequence_id FROM community_messages m WHERE m.channel_id=c.id AND m.moderation_status IN ('active','moderated') ORDER BY m.sequence_id DESC LIMIT 1) AS latest_sequence,
        (SELECT m.body FROM community_messages m WHERE m.channel_id=c.id AND m.moderation_status IN ('active','moderated') ORDER BY m.sequence_id DESC LIMIT 1) AS latest_body,
        (SELECT m.author_label FROM community_messages m WHERE m.channel_id=c.id AND m.moderation_status IN ('active','moderated') ORDER BY m.sequence_id DESC LIMIT 1) AS latest_author,
        (SELECT m.created_at FROM community_messages m WHERE m.channel_id=c.id AND m.moderation_status IN ('active','moderated') ORDER BY m.sequence_id DESC LIMIT 1) AS latest_at,
        MAX(0, COALESCE((SELECT m.sequence_id FROM community_messages m WHERE m.channel_id=c.id AND m.moderation_status IN ('active','moderated') ORDER BY m.sequence_id DESC LIMIT 1), 0) -
          COALESCE((SELECT r.last_read_sequence FROM channel_read_state r WHERE r.channel_id=c.id AND r.user_id=?${visibilityValues.length + 1}), 0)) AS unread_count,
        CASE WHEN ${visibleSql}
          AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE b.user_id=?${visibilityValues.length + 2} AND b.ends_at>?${visibilityValues.length + 3} AND (b.channel_id IS NULL OR b.channel_id=c.id))
          AND ((c.write_policy NOT IN ('moderators','read_only') AND c.channel_kind<>'announcement')
            OR (?${visibilityValues.length + 4}=1 AND (c.write_policy='moderators' OR c.channel_kind='announcement')))
          THEN 1 ELSE 0 END AS can_write
      FROM community_channels c
      WHERE c.is_active=1 AND ${visibleSql}
      ORDER BY c.sort_order,c.title
    `).bind(...visibilityValues, userId, userId, nowIso(), privilegedFlag).all<Record<string, unknown>>()).results ?? [];
    return rows.map((row) => decodeRow(row));
  }
  const key = args.p_channel_key ? String(args.p_channel_key) : null;
  const channel = key ? await db.prepare("SELECT * FROM community_channels WHERE channel_key=?1 AND is_active=1").bind(key).first<Record<string, unknown>>() : null;
  if (name === "phase10_list_channel_members") {
    if (!channel || !(await channelVisible(db,userId,channel))) throw new Error("Channel not found or access denied.");
    const limit = Math.min(200,Math.max(1,Number(args.p_limit??120)));
    const members = (await db.prepare(`SELECT DISTINCT m.user_id,COALESCE(NULLIF(TRIM(p.display_name),''),m.author_label,'Student') AS label FROM community_messages m LEFT JOIN profiles p ON p.user_id=m.user_id WHERE m.channel_id=?1 ORDER BY label LIMIT ${limit}`).bind(channel.id).all<Record<string, unknown>>()).results ?? [];
    return members;
  }
  if (name === "phase10_create_message") {
    if (!channel || !(await canWriteChannel(db,userId,role,channel))) throw new Error("Channel is read-only or access is blocked.");
    const body = String(args.p_body??"").trim(); if (!body || body.length>8000) throw new Error("Message is empty or too long.");
    const reply = args.p_reply_to_message_id ? String(args.p_reply_to_message_id) : null; const resource = args.p_attached_resource_id ? String(args.p_attached_resource_id) : null;
    const profile=await db.prepare("SELECT display_name FROM profiles WHERE user_id=?1").bind(userId).first<{display_name:string|null}>(); const label=profile?.display_name?.trim()||"Student";
    const max=await db.prepare("SELECT COALESCE(MAX(sequence_id),0) AS value FROM community_messages WHERE channel_id=?1").bind(channel.id).first<{value:number}>(); const sequence=Number(max?.value??0)+1; const id=uuid();
    await db.prepare("INSERT INTO community_messages(id,sequence_id,channel_id,user_id,author_label,body,reply_to_message_id,attached_resource_id,moderation_status,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'active',?9)")
      .bind(id,sequence,channel.id,userId,label,body,reply,resource,nowIso()).run();
    const mentions=Array.isArray(args.p_mention_user_ids)?[...new Set(args.p_mention_user_ids.map(String))]:[];
    for (const mentioned of mentions) if (mentioned!==userId) await db.prepare("INSERT INTO community_notifications(id,user_id,channel_id,message_id,notification_type,read_at,created_at) VALUES(?1,?2,?3,?4,'mention',NULL,?5)").bind(uuid(),mentioned,channel.id,id,nowIso()).run();
    return id;
  }
  if (name === "phase10_mark_read") {
    if (!channel || !(await channelVisible(db,userId,channel))) throw new Error("Channel not found or access denied.");
    const max=await db.prepare("SELECT COALESCE(MAX(sequence_id),0) AS value FROM community_messages WHERE channel_id=?1").bind(channel.id).first<{value:number}>(); const seq=Math.min(Number(max?.value??0),Number(args.p_sequence_id??max?.value??0));
    await db.prepare("INSERT INTO channel_read_state(channel_id,user_id,last_read_sequence,last_read_at,updated_at) VALUES(?1,?2,?3,?4,?4) ON CONFLICT(channel_id,user_id) DO UPDATE SET last_read_sequence=MAX(channel_read_state.last_read_sequence,excluded.last_read_sequence),last_read_at=excluded.last_read_at,updated_at=excluded.updated_at")
      .bind(channel.id,userId,seq,nowIso()).run(); return seq;
  }
  if (name === "phase10_toggle_reaction") {
    const messageId=String(args.p_message_id??""); const emoji=String(args.p_emoji??""); const msg=await db.prepare("SELECT m.id,m.channel_id,c.* FROM community_messages m JOIN community_channels c ON c.id=m.channel_id WHERE m.id=?1").bind(messageId).first<Record<string, unknown>>();
    if(!msg||!(await channelVisible(db,userId,{...msg,id:msg.channel_id}))) throw new Error("Message not found or access denied.");
    const existing=await db.prepare("SELECT 1 FROM message_reactions WHERE message_id=?1 AND user_id=?2 AND emoji=?3").bind(messageId,userId,emoji).first();
    if(existing) await db.prepare("DELETE FROM message_reactions WHERE message_id=?1 AND user_id=?2 AND emoji=?3").bind(messageId,userId,emoji).run();
    else await db.prepare("INSERT INTO message_reactions(message_id,channel_id,user_id,emoji) VALUES(?1,?2,?3,?4)").bind(messageId,msg.channel_id,userId,emoji).run();
    return !existing;
  }
  if (name === "phase10_report_message") {
    const messageId=String(args.p_message_id??""); const reason=String(args.p_reason??"other"); const details=args.p_details?String(args.p_details):null; const msg=await db.prepare("SELECT channel_id FROM community_messages WHERE id=?1").bind(messageId).first<{channel_id:string}>(); if(!msg) throw new Error("Message not found.");
    const id=uuid(); await db.prepare("INSERT INTO message_reports(id,message_id,channel_id,reporter_user_id,reason,details,status,created_at) VALUES(?1,?2,?3,?4,?5,?6,'open',?7)").bind(id,messageId,msg.channel_id,userId,reason,details,nowIso()).run(); return id;
  }
  if (name === "phase10_moderate") {
    if(!privileged(role)) throw new Error("Moderator access required.");
    const action=String(args.p_action??""); const messageId=args.p_message_id?String(args.p_message_id):null; const reportId=args.p_report_id?String(args.p_report_id):null; const target=args.p_target_user_id?String(args.p_target_user_id):null; const channelId=args.p_channel_id?String(args.p_channel_id):null; const reason=args.p_reason?String(args.p_reason):null; const minutes=Number(args.p_duration_minutes??0); const now=nowIso();
    if(action==="delete_message"&&messageId) await db.prepare("UPDATE community_messages SET moderation_status='moderated' WHERE id=?1").bind(messageId).run();
    else if((action==="resolve_report"||action==="dismiss_report")&&reportId) await db.prepare("UPDATE message_reports SET status=?1,reviewed_by=?2,reviewed_at=?3 WHERE id=?4").bind(action==="resolve_report"?"reviewed":"dismissed",userId,now,reportId).run();
    else if(action==="block"&&target&&minutes>0) { const end=new Date(Date.now()+minutes*60000).toISOString(); await db.prepare("INSERT INTO chat_blocks(id,user_id,channel_id,blocked_by,reason,starts_at,ends_at,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?6)").bind(uuid(),target,channelId,userId,reason||"Chat violation",now,end).run(); }
    else if(action==="unblock"&&target) await db.prepare("DELETE FROM chat_blocks WHERE user_id=?1 AND (?2 IS NULL OR channel_id=?2 OR channel_id IS NULL)").bind(target,channelId).run();
    else throw new Error("Unknown moderation action.");
    await db.prepare("INSERT INTO moderation_actions(id,actor_user_id,actor_role,action_type,target_user_id,channel_id,message_id,report_id,reason,metadata,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,'{}',?10)").bind(uuid(),userId,role,action,target,channelId,messageId,reportId,reason,now).run();
    return {ok:true};
  }
  throw new Error(`Unsupported community RPC: ${name}`);
}

async function resourceRpc(db:D1DatabaseLike,userId:string,role:AppRole,name:string,args:Record<string,unknown>){
  if(name==="phase7_save_note") return saveNote(db,userId,args);
  if(name==="phase7_report_resource"){
    const type=String(args.p_entity_type??""); const target=String(args.p_entity_id??""); const reason=String(args.p_reason??"other"); const details=args.p_details?String(args.p_details):null;
    if(!["note","upload"].includes(type)) throw new Error("Unknown resource type."); const id=uuid(); const note=type==="note"?target:null; const upload=type==="upload"?target:null;
    await db.prepare("INSERT INTO resource_reports(id,entity_type,note_id,uploaded_resource_id,reporter_user_id,reason,details,status,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,'open',?8)").bind(id,type,note,upload,userId,reason,details,nowIso()).run();
    if(type==="note") await db.prepare("UPDATE notes SET moderation_status='reported',published_at=NULL,updated_at=?1 WHERE id=?2 AND visibility='shared'").bind(nowIso(),target).run(); else await db.prepare("UPDATE uploaded_resources SET moderation_status='reported',published_at=NULL,updated_at=?1 WHERE id=?2 AND visibility='shared'").bind(nowIso(),target).run();
    return id;
  }
  if(name==="phase7_moderate_resource"){
    if(!privileged(role)) throw new Error("Moderator access required."); const type=String(args.p_entity_type??""); const target=String(args.p_entity_id??""); const decision=String(args.p_decision??""); if(!["approve","reject"].includes(decision)) throw new Error("Unknown moderation decision."); const status=decision==="approve"?"approved":"rejected"; const published=status==="approved"?nowIso():null;
    const table=type==="note"?"notes":type==="upload"?"uploaded_resources":null; if(!table) throw new Error("Unknown resource type."); const before=await db.prepare(`SELECT moderation_status FROM ${ident(table)} WHERE id=?1 AND visibility='shared'`).bind(target).first<{moderation_status:string}>(); if(!before) throw new Error("Shared resource not found.");
    await db.prepare(`UPDATE ${ident(table)} SET moderation_status=?1,published_at=?2,updated_at=?3 WHERE id=?4`).bind(status,published,nowIso(),target).run();
    await db.prepare("INSERT INTO resource_moderation(id,entity_type,note_id,uploaded_resource_id,actor_user_id,action,from_status,to_status,notes,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)").bind(uuid(),type,type==="note"?target:null,type==="upload"?target:null,userId,decision,before.moderation_status,status,args.p_notes?String(args.p_notes):null,nowIso()).run(); return null;
  }
  throw new Error(`Unsupported resource RPC: ${name}`);
}

async function phase9Rules(db:D1DatabaseLike,userId:string,args:Record<string,unknown>){
  const intervals=Array.isArray(args.p_interval_days)?args.p_interval_days.map(Number):[]; const weekdays=Array.isArray(args.p_preferred_weekdays)?args.p_preferred_weekdays.map(Number):[]; const rev=Number(args.p_revision_minutes); const fresh=Number(args.p_new_chapter_minutes); const test=Number(args.p_test_minutes);
  if(!intervals.length||intervals.length>5||intervals.some(v=>v<1||v>180)||!weekdays.length||weekdays.length>7||weekdays.some(v=>v<0||v>6)||rev<10||rev>360||fresh<15||fresh>480||test<15||test>360) throw new Error("Revision planner settings are invalid.");
  await db.prepare("INSERT INTO revision_rules(user_id,interval_days,preferred_weekdays,revision_minutes,new_chapter_minutes,test_minutes,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(user_id) DO UPDATE SET interval_days=excluded.interval_days,preferred_weekdays=excluded.preferred_weekdays,revision_minutes=excluded.revision_minutes,new_chapter_minutes=excluded.new_chapter_minutes,test_minutes=excluded.test_minutes,updated_at=excluded.updated_at")
    .bind(userId,JSON.stringify(intervals),JSON.stringify(weekdays),rev,fresh,test,nowIso()).run(); await rebuildRevisionSchedule(db,userId); return {ok:true};
}

async function icaiReview(db:D1DatabaseLike,userId:string,role:AppRole,args:Record<string,unknown>){
  if(role!=="admin"&&role!=="owner"&&role!=="parent_owner") throw new Error("Admin access required.");
  const id=String(args.p_review_id??args.p_queue_id??""); const decision=String(args.p_decision??""); const notes=args.p_notes?String(args.p_notes):null; if(!id||!["approve","reject","dismiss"].includes(decision)) throw new Error("Invalid ICAI review decision.");
  const now=nowIso(); await db.prepare("UPDATE icai_review_queue SET status=?1,reviewed_by=?2,reviewed_at=?3,review_notes=?4,updated_at=?3 WHERE id=?5").bind(decision==="approve"?"approved":decision==="reject"?"rejected":"dismissed",userId,now,notes,id).run(); return {ok:true};
}

async function executeRpc(db:D1DatabaseLike,name:string,args:Record<string,unknown>,options:ClientOptions){
  const auth = options.actorUserId !== undefined ? null : await getCloudflareRequestAuth();
  const userId=options.actorUserId ?? auth?.applicationUserId ?? null; const role=options.actorRole ?? auth?.role ?? (await userRole(db,userId));
  if(["progress_set_stage","progress_undo_event","phase6_set_timezone","study_timer_start","study_timer_pause","study_timer_resume","study_timer_finish","study_timer_discard","study_timer_touch","phase7_save_note","phase7_report_resource","phase7_moderate_resource","phase9_set_revision_rules","phase10_list_channels","phase10_list_channel_members","phase10_create_message","phase10_mark_read","phase10_toggle_reaction","phase10_report_message","phase10_moderate","icai_review_decide"].includes(name)&&!userId) throw new Error("Authentication required.");
  if(name==="progress_set_stage") return progressSetStage(db,userId!,args);
  if(name==="progress_undo_event") return progressUndo(db,userId!,args);
  if(name==="phase6_set_timezone") { const timezone=String(args.p_timezone??""); try{new Intl.DateTimeFormat("en-US",{timeZone:timezone}).format(new Date());}catch{throw new Error("Unknown timezone.");} const now=nowIso(); await db.batch([db.prepare("UPDATE profiles SET timezone=?1,updated_at=?2 WHERE user_id=?3").bind(timezone,now,userId!),db.prepare("UPDATE study_timer_state SET timezone=?1,updated_at=?2 WHERE user_id=?3").bind(timezone,now,userId!)]); return {timezone}; }
  if(name.startsWith("study_timer_")) return studyTimerRpc(db,userId!,name,args);
  if(name.startsWith("phase7_")) return resourceRpc(db,userId!,role,name,args);
  if(name==="phase9_set_revision_rules") return phase9Rules(db,userId!,args);
  if(name.startsWith("phase10_")) return communityRpc(db,userId!,role,name,args);
  if(name==="icai_review_decide") return icaiReview(db,userId!,role,args);
  throw new Error(`Unsupported D1 RPC: ${name}`);
}

class D1QueryBuilder {
  private operation: "select"|"insert"|"upsert"|"update"|"delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private payload: Record<string, unknown>|Record<string, unknown>[]|null = null;
  private conflict: string[] = [];
  private filters: Filter[] = [];
  private orders: Array<{column:string;ascending:boolean}> = [];
  private maxRows: number | null = null;
  private fromRow: number | null = null;
  private toRow: number | null = null;
  private cardinality: "many"|"single"|"maybe" = "many";
  constructor(private db:D1DatabaseLike,private table:string,private options:ClientOptions){ ident(table); }
  select(columns="*"){ if(this.operation==="select") this.columns=columns; else this.returning=columns; return this; }
  insert(value:Record<string,unknown>|Record<string,unknown>[]){this.operation="insert";this.payload=value;return this;}
  upsert(value:Record<string,unknown>|Record<string,unknown>[],options?:{onConflict?:string}){this.operation="upsert";this.payload=value;this.conflict=(options?.onConflict??"").split(",").map(v=>v.trim()).filter(Boolean);return this;}
  update(value:Record<string,unknown>){this.operation="update";this.payload=value;return this;}
  delete(){this.operation="delete";return this;}
  eq(column:string,value:unknown){return this.filter(column,"=",value);}
  neq(column:string,value:unknown){return this.filter(column,"<>",value);}
  gt(column:string,value:unknown){return this.filter(column,">",value);}
  gte(column:string,value:unknown){return this.filter(column,">=",value);}
  lt(column:string,value:unknown){return this.filter(column,"<",value);}
  lte(column:string,value:unknown){return this.filter(column,"<=",value);}
  like(column:string,value:string){return this.filter(column,"LIKE",value);}
  ilike(column:string,value:string){ident(column);this.filters.push({sql:`LOWER(${ident(column)}) LIKE LOWER(?)`,values:[value]});return this;}
  is(column:string,value:unknown){ident(column); if(value===null)this.filters.push({sql:`${ident(column)} IS NULL`,values:[]}); else this.filters.push({sql:`${ident(column)} IS ?`,values:[encodeValue(value)]});return this;}
  in(column:string,values:unknown[]){ident(column);if(!values.length)this.filters.push({sql:"1=0",values:[]});else this.filters.push({sql:`${ident(column)} IN (${values.map(()=>"?").join(",")})`,values:values.map(encodeValue)});return this;}
  order(column:string,options?:{ascending?:boolean}){ident(column);this.orders.push({column,ascending:options?.ascending!==false});return this;}
  limit(value:number){this.maxRows=Math.max(0,Math.floor(value));return this;}
  range(from:number,to:number){this.fromRow=Math.max(0,Math.floor(from));this.toRow=Math.max(this.fromRow,Math.floor(to));return this;}
  single(){this.cardinality="single";return this.thenResult();}
  maybeSingle(){this.cardinality="maybe";return this.thenResult();}
  then<TResult1 = QueryResult, TResult2 = never>(onfulfilled?: ((value:QueryResult)=>TResult1|PromiseLike<TResult1>)|null,onrejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null){return this.execute().then(onfulfilled,onrejected);}
  private filter(column:string,op:string,value:unknown){ident(column);if(value===null&&(op==="="||op==="<>")){this.filters.push({sql:`${ident(column)} IS ${op==="<>"?"NOT ":""}NULL`,values:[]});}else this.filters.push({sql:`${ident(column)} ${op} ?`,values:[encodeValue(value)]});return this;}
  private thenResult(){return this.execute();}
  private where(extra?:Filter){const all=[...this.filters];if(extra)all.push(extra);return {sql:all.length?` WHERE ${all.map(v=>v.sql).join(" AND ")}`:"",values:all.flatMap(v=>v.values)};}
  private async preparedRow(input:Record<string,unknown>){const info=await tableInfo(this.db,this.table);const row={...(INSERT_DEFAULTS[this.table]??{}),...input};const idInfo=info.find(v=>v.name==="id"&&v.pk===1&&String(v.type).toUpperCase().includes("TEXT"));if(idInfo&&!Object.hasOwn(row,"id"))row.id=uuid();const owner=OWNER_COLUMN[this.table];if(!this.options.admin&&owner&&this.options.actorUserId){if(Object.hasOwn(row,owner)&&row[owner]!==this.options.actorUserId)throw new Error("Cannot write data for another user.");row[owner]=this.options.actorUserId;}return row;}
  private mutationOwnerFilter(){const owner=OWNER_COLUMN[this.table];if(this.options.admin||!owner)return undefined;if(!this.options.actorUserId)return {sql:"1=0",values:[]};return {sql:`${ident(owner)}=?`,values:[this.options.actorUserId]};}
  private async execute():Promise<QueryResult>{const startedAt=performance.now();let rowCount:number|null=null;try{
    if(this.operation==="select"){
      const where=this.where();const order=this.orders.length?` ORDER BY ${this.orders.map(v=>`${ident(v.column)} ${v.ascending?"ASC":"DESC"}`).join(",")}`:"";let limit="";if(this.fromRow!==null&&this.toRow!==null)limit=` LIMIT ${this.toRow-this.fromRow+1} OFFSET ${this.fromRow}`;else if(this.maxRows!==null)limit=` LIMIT ${this.maxRows}`;
      const result=await this.db.prepare(`SELECT ${selectList(this.columns)} FROM ${ident(this.table)}${where.sql}${order}${limit}`).bind(...where.values).all<Record<string,unknown>>();const data=(result.results??[]).map(decodeRow);rowCount=data.length;
      if(this.cardinality==="single"){if(data.length!==1)return{data:null,error:{message:`Expected one ${this.table} row, found ${data.length}.`,code:"PGRST116"}};return{data:data[0],error:null};}
      if(this.cardinality==="maybe"){if(data.length>1)return{data:null,error:{message:`Expected at most one ${this.table} row, found ${data.length}.`,code:"PGRST116"}};return{data:data[0]??null,error:null};}
      return{data,error:null};
    }
    if(this.operation==="insert"||this.operation==="upsert"){
      const inputs=Array.isArray(this.payload)?this.payload:[this.payload??{}];const out:Record<string,unknown>[]=[];
      for(const input of inputs){const row=await this.preparedRow(input);const keys=Object.keys(row);if(!keys.length)throw new Error("Insert payload is empty.");const values=keys.map(k=>encodeValue(row[k]));let sql=`INSERT INTO ${ident(this.table)}(${keys.map(ident).join(",")}) VALUES(${keys.map(()=>"?").join(",")})`;
        if(this.operation==="upsert"){if(!this.conflict.length)throw new Error("D1 upsert requires onConflict.");const updates=keys.filter(k=>!this.conflict.includes(k));sql+=` ON CONFLICT(${this.conflict.map(ident).join(",")}) ${updates.length?`DO UPDATE SET ${updates.map(k=>`${ident(k)}=excluded.${ident(k)}`).join(",")}`:"DO NOTHING"}`;}
        if(this.returning)sql+=` RETURNING ${selectList(this.returning)}`;const stmt=this.db.prepare(sql).bind(...values);if(this.returning){const result=await stmt.all<Record<string,unknown>>();out.push(...(result.results??[]).map(decodeRow));}else await stmt.run();}
      rowCount=this.returning ? out.length : null;const data=this.returning?(Array.isArray(this.payload)?out:out[0]??null):null;return{data,error:null};
    }
    if(this.operation==="update"){
      const row:Record<string,unknown>={...(Array.isArray(this.payload)?{}:(this.payload??{}))};const info=await tableInfo(this.db,this.table);if(info.some(v=>v.name==="updated_at")&&!Object.hasOwn(row,"updated_at"))row.updated_at=nowIso();const keys=Object.keys(row);if(!keys.length)throw new Error("Update payload is empty.");const where=this.where(this.mutationOwnerFilter());let sql=`UPDATE ${ident(this.table)} SET ${keys.map(k=>`${ident(k)}=?`).join(",")}${where.sql}`;if(this.returning)sql+=` RETURNING ${selectList(this.returning)}`;const stmt=this.db.prepare(sql).bind(...keys.map(k=>encodeValue(row[k])),...where.values);if(this.returning){const result=await stmt.all<Record<string,unknown>>();const rows=(result.results??[]).map(decodeRow);rowCount=rows.length;return{data:rows,error:null};}await stmt.run();return{data:null,error:null};
    }
    const where=this.where(this.mutationOwnerFilter());let sql=`DELETE FROM ${ident(this.table)}${where.sql}`;if(this.returning)sql+=` RETURNING ${selectList(this.returning)}`;const stmt=this.db.prepare(sql).bind(...where.values);if(this.returning){const result=await stmt.all<Record<string,unknown>>();return{data:(result.results??[]).map(decodeRow),error:null};}await stmt.run();return{data:null,error:null};
  }catch(error){return errorResult(error);}finally{logServerPerformance(`d1.${this.operation}`,startedAt,{table:this.table,rows:rowCount});}}
}

export class D1ApplicationClient {
  constructor(private db:D1DatabaseLike,private options:ClientOptions={}){}
  from(table:string){return new D1QueryBuilder(this.db,table,this.options);}
  async rpc(name:string,args:Record<string,unknown>={}){const startedAt=performance.now();try{return{data:await executeRpc(this.db,name,args,this.options),error:null};}catch(error){return errorResult(error);}finally{logServerPerformance(`d1.rpc.${name}`,startedAt,{table:"rpc",rows:null});}}
}

export async function createD1ServerClient(){const auth=await getCloudflareRequestAuth();return new D1ApplicationClient(getD1RuntimeDatabase(),{actorUserId:auth.applicationUserId,actorRole:auth.role});}
export function createD1AdminClient(){return new D1ApplicationClient(getD1RuntimeDatabase(),{admin:true});}

