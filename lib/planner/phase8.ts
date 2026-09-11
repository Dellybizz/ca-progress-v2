import "server-only";

import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { getD1RuntimeDatabase, type D1DatabaseLike } from "@/lib/data/d1/client";
import type {
  AttemptCountdown,
  GoalKind,
  GoalUnit,
  NotificationFrequency,
  NotificationPreferences,
  PlannerGoal,
  PlannerNotification,
  PlannerNotificationType,
  TaskKind,
  TaskScheduleMode,
} from "./types";

const TASK_KINDS: TaskKind[] = ["class", "study", "revision", "test", "mock", "personal", "other"];
const GOAL_KINDS: GoalKind[] = ["daily_study", "weekly_study", "completion", "revision", "test", "custom"];
const FREQUENCIES: NotificationFrequency[] = ["realtime", "daily_digest", "off"];
const DAY_MS = 86_400_000;

type TaskExtensionRow = { task_id: string; schedule_mode: TaskScheduleMode; target_date: string | null };
type GoalRow = { id: string; title: string; description: string | null; due_date: string; status: string; completed_at: string | null; created_at: string; goal_kind: GoalKind | null; target_value: number | null; target_unit: GoalUnit | null; starts_on: string | null };
type SessionRow = { ended_at: string; duration_seconds: number };
type ProgressRow = { completed_at: string | null; revision_1_at: string | null; revision_2_at: string | null; test_1_at: string | null; test_2_at: string | null };
type NotificationRow = { id: string; notification_type: PlannerNotificationType; title: string; body: string; action_href: string; read_at: string | null; created_at: string };
type NotificationCandidate = Omit<NotificationRow, "id" | "read_at" | "created_at"> & { dedupeKey: string; entityType: string | null; entityId: string | null };

function validDate(value: string | null | undefined) { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function safeTimeZone(value: string | null | undefined) { const zone = value || "Asia/Kolkata"; try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date()); return zone; } catch { return "Asia/Kolkata"; } }
export function dateKeyInTimezone(timezone: string, value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.valueOf())) return typeof value === "string" ? value.slice(0, 10) : "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTimeZone(timezone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function shiftDateKey(value: string, days: number) { const date = new Date(`${value}T12:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function localDaysBetween(from: string, to: string) { return Math.round((new Date(`${to}T12:00:00.000Z`).valueOf() - new Date(`${from}T12:00:00.000Z`).valueOf()) / DAY_MS); }
function inDateWindow(value: string | null, startsOn: string, dueDate: string, timezone: string) { if (!value) return false; const key = dateKeyInTimezone(timezone, value); return key >= startsOn && key <= dueDate; }
function plannerEvent(db: D1DatabaseLike, userId: string, eventType: "task_changed" | "goal_changed", entityType: "task" | "goal", entityId: string, payload: Record<string, unknown>) {
  return db.prepare("INSERT INTO planner_events(id,user_id,event_type,entity_type,entity_id,payload,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)")
    .bind(crypto.randomUUID(), userId, eventType, entityType, entityId, JSON.stringify(payload), new Date().toISOString());
}

async function assertAcademicSelection(userId: string, subjectId: string | null, chapterId: string | null, db: D1DatabaseLike) {
  if (subjectId) {
    const subject = await db.prepare(`SELECT 1 AS valid FROM profiles p JOIN course_levels l ON l.code=p.ca_level
      JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key AND asm.subject_id=?1
      JOIN course_groups g ON g.id=asm.group_id WHERE p.user_id=?2 AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice) LIMIT 1`).bind(subjectId, userId).first();
    if (!subject) throw new Error("Selected subject is not applicable.");
  }
  if (chapterId) {
    const chapter = await db.prepare(`SELECT c.id,sv.subject_id FROM profiles p JOIN course_levels l ON l.code=p.ca_level
      JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key
      JOIN chapters c ON c.syllabus_version_id=asm.syllabus_version_id JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id
      WHERE p.user_id=?1 AND c.id=?2 AND p.onboarding_completed_at IS NOT NULL
      AND (p.ca_level='foundation' OR p.group_choice IN ('both','not_applicable') OR asm.group_id IN (SELECT id FROM course_groups WHERE code=p.group_choice)) LIMIT 1`).bind(userId, chapterId).first<{ id: string; subject_id: string }>();
    if (!chapter || (subjectId && chapter.subject_id !== subjectId)) throw new Error("Selected chapter is not applicable.");
  }
}

function normalizedTask(input: { title: string; notes: string | null; taskKind: TaskKind; subjectId: string | null; chapterId: string | null; dueAt: string; scheduleMode: TaskScheduleMode; targetDate: string | null; estimatedMinutes: number }) {
  if (!input.title || input.title.length > 160 || !TASK_KINDS.includes(input.taskKind) || !["fixed", "flexible"].includes(input.scheduleMode) || !Number.isFinite(input.estimatedMinutes) || input.estimatedMinutes < 1 || input.estimatedMinutes > 720) throw new Error("Check the task title, schedule, type and estimated minutes.");
  if (input.scheduleMode === "fixed" && !Number.isFinite(Date.parse(input.dueAt))) throw new Error("Choose a valid fixed task date and time.");
  if (input.scheduleMode === "flexible" && !validDate(input.targetDate)) throw new Error("Choose a valid flexible target date.");
  const dueAt = input.scheduleMode === "flexible" ? `${input.targetDate}T12:00:00.000Z` : new Date(input.dueAt).toISOString();
  return { ...input, dueAt, targetDate: input.scheduleMode === "flexible" ? input.targetDate : null };
}

export async function createPhase8Task(userId: string, input: Parameters<typeof normalizedTask>[0], db = getD1RuntimeDatabase()) {
  const value = normalizedTask(input);
  await assertAcademicSelection(userId, value.subjectId, value.chapterId, db);
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO tasks (id,user_id,title,notes,task_kind,subject_id,chapter_id,due_at,estimated_minutes,status,completed_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'todo',NULL)").bind(id, userId, value.title, value.notes, value.taskKind, value.subjectId, value.chapterId, value.dueAt, value.estimatedMinutes),
    db.prepare("INSERT INTO planner_task_phase8(task_id,user_id,schedule_mode,target_date) VALUES(?1,?2,?3,?4)").bind(id, userId, value.scheduleMode, value.targetDate),
    plannerEvent(db, userId, "task_changed", "task", id, { action: "create", scheduleMode: value.scheduleMode, targetDate: value.targetDate }),
  ]);
  return { id, ...value, status: "todo", completed_at: null };
}

export async function updatePhase8Task(userId: string, id: string, input: Parameters<typeof normalizedTask>[0], db = getD1RuntimeDatabase()) {
  const value = normalizedTask(input);
  const owned = await db.prepare("SELECT id FROM tasks WHERE id=?1 AND user_id=?2 LIMIT 1").bind(id, userId).first();
  if (!owned) throw new Error("Task not found.");
  await assertAcademicSelection(userId, value.subjectId, value.chapterId, db);
  await db.batch([
    db.prepare("UPDATE tasks SET title=?1,notes=?2,task_kind=?3,subject_id=?4,chapter_id=?5,due_at=?6,estimated_minutes=?7,updated_at=CURRENT_TIMESTAMP WHERE id=?8 AND user_id=?9").bind(value.title, value.notes, value.taskKind, value.subjectId, value.chapterId, value.dueAt, value.estimatedMinutes, id, userId),
    db.prepare("INSERT INTO planner_task_phase8(task_id,user_id,schedule_mode,target_date) VALUES(?1,?2,?3,?4) ON CONFLICT(task_id) DO UPDATE SET schedule_mode=excluded.schedule_mode,target_date=excluded.target_date,updated_at=CURRENT_TIMESTAMP WHERE user_id=excluded.user_id").bind(id, userId, value.scheduleMode, value.targetDate),
    plannerEvent(db, userId, "task_changed", "task", id, { action: "update", scheduleMode: value.scheduleMode, targetDate: value.targetDate }),
  ]);
  return { ok: true };
}

export async function togglePhase8Task(userId: string, id: string, done: boolean, db = getD1RuntimeDatabase()) {
  const owned = await db.prepare("SELECT id FROM tasks WHERE id=?1 AND user_id=?2 LIMIT 1").bind(id, userId).first();
  if (!owned) throw new Error("Task not found.");
  const completedAt = done ? new Date().toISOString() : null;
  await db.batch([
    db.prepare("UPDATE tasks SET status=?1,completed_at=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?3 AND user_id=?4").bind(done ? "done" : "todo", completedAt, id, userId),
    plannerEvent(db, userId, "task_changed", "task", id, { action: done ? "complete" : "reopen" }),
  ]);
  return { ok: true };
}

export async function deletePhase8Task(userId: string, id: string, db = getD1RuntimeDatabase()) {
  const owned = await db.prepare("SELECT id FROM tasks WHERE id=?1 AND user_id=?2 LIMIT 1").bind(id, userId).first();
  if (!owned) throw new Error("Task not found.");
  await db.batch([plannerEvent(db, userId, "task_changed", "task", id, { action: "delete" }), db.prepare("DELETE FROM tasks WHERE id=?1 AND user_id=?2").bind(id, userId)]);
  return { ok: true };
}

export async function getTaskPlanningExtensions(userId: string, taskIds: string[], db = getD1RuntimeDatabase()) {
  const values = [...new Set(taskIds)].slice(0, 500);
  if (!values.length) return new Map<string, TaskExtensionRow>();
  const placeholders = values.map((_, index) => `?${index + 2}`).join(",");
  const rows = (await db.prepare(`SELECT task_id,schedule_mode,target_date FROM planner_task_phase8 WHERE user_id=?1 AND task_id IN (${placeholders})`).bind(userId, ...values).all<TaskExtensionRow>()).results ?? [];
  return new Map(rows.map((row) => [row.task_id, row]));
}

function validateGoal(input: { title: string; description: string | null; dueDate: string; goalKind: GoalKind; targetValue: number; startsOn: string | null }) {
  if (!input.title || input.title.length > 160 || !validDate(input.dueDate) || !GOAL_KINDS.includes(input.goalKind) || !Number.isInteger(input.targetValue) || input.targetValue < 1 || input.targetValue > 100000 || (input.startsOn && !validDate(input.startsOn))) throw new Error("Enter a valid goal, date and target.");
  if (input.startsOn && input.startsOn > input.dueDate) throw new Error("Goal start date must be on or before its due date.");
  const targetUnit: GoalUnit = input.goalKind === "daily_study" || input.goalKind === "weekly_study" ? "minutes" : "count";
  return { ...input, targetUnit };
}

export async function createPhase8Goal(userId: string, input: Parameters<typeof validateGoal>[0], db = getD1RuntimeDatabase()) {
  const value = validateGoal(input);
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO goals (id,user_id,title,description,due_date,status,completed_at) VALUES (?1,?2,?3,?4,?5,'active',NULL)").bind(id, userId, value.title, value.description, value.dueDate),
    db.prepare("INSERT INTO planner_goal_phase8(goal_id,user_id,goal_kind,target_value,target_unit,starts_on) VALUES(?1,?2,?3,?4,?5,?6)").bind(id, userId, value.goalKind, value.targetValue, value.targetUnit, value.startsOn),
    plannerEvent(db, userId, "goal_changed", "goal", id, { action: "create", goalKind: value.goalKind, targetValue: value.targetValue }),
  ]);
  return { id, ...value, status: "active", completed_at: null };
}

export async function togglePhase8Goal(userId: string, id: string, done: boolean, db = getD1RuntimeDatabase()) {
  const owned = await db.prepare("SELECT id FROM goals WHERE id=?1 AND user_id=?2 LIMIT 1").bind(id, userId).first();
  if (!owned) throw new Error("Goal not found.");
  await db.batch([
    db.prepare("UPDATE goals SET status=?1,completed_at=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?3 AND user_id=?4").bind(done ? "completed" : "active", done ? new Date().toISOString() : null, id, userId),
    plannerEvent(db, userId, "goal_changed", "goal", id, { action: done ? "complete" : "reopen" }),
  ]);
  return { ok: true };
}

export async function deletePhase8Goal(userId: string, id: string, db = getD1RuntimeDatabase()) {
  const owned = await db.prepare("SELECT id FROM goals WHERE id=?1 AND user_id=?2 LIMIT 1").bind(id, userId).first();
  if (!owned) throw new Error("Goal not found.");
  await db.batch([plannerEvent(db, userId, "goal_changed", "goal", id, { action: "delete" }), db.prepare("DELETE FROM goals WHERE id=?1 AND user_id=?2").bind(id, userId)]);
  return { ok: true };
}

export async function getPhase8GoalSummaries(userId: string, timezone: string, db = getD1RuntimeDatabase()): Promise<PlannerGoal[]> {
  const result = await db.batch([
    db.prepare(`SELECT g.id,g.title,g.description,g.due_date,g.status,g.completed_at,g.created_at,e.goal_kind,e.target_value,e.target_unit,e.starts_on
      FROM goals g LEFT JOIN planner_goal_phase8 e ON e.goal_id=g.id AND e.user_id=g.user_id
      WHERE g.user_id=?1 AND g.status<>'cancelled' ORDER BY g.due_date ASC LIMIT 100`).bind(userId),
    db.prepare("SELECT ended_at,duration_seconds FROM study_sessions WHERE user_id=?1 ORDER BY ended_at DESC LIMIT 5000").bind(userId),
    db.prepare("SELECT completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at FROM chapter_progress WHERE user_id=?1").bind(userId),
  ]);
  const goals = (result[0]?.results ?? []) as GoalRow[];
  const sessions = (result[1]?.results ?? []) as SessionRow[];
  const progress = (result[2]?.results ?? []) as ProgressRow[];
  return goals.map((row) => {
    const goalKind: GoalKind = row.goal_kind ?? "custom";
    const targetUnit: GoalUnit = row.target_unit ?? (goalKind === "daily_study" || goalKind === "weekly_study" ? "minutes" : "count");
    const targetValue = Math.max(1, Number(row.target_value ?? 1));
    const startsOn = row.starts_on ?? dateKeyInTimezone(timezone, row.created_at);
    let currentValue = 0;
    if (goalKind === "daily_study" || goalKind === "weekly_study") currentValue = Math.round(sessions.reduce((sum, session) => inDateWindow(session.ended_at, startsOn, row.due_date, timezone) ? sum + session.duration_seconds : sum, 0) / 60);
    else if (goalKind === "completion") currentValue = progress.reduce((sum, item) => sum + (inDateWindow(item.completed_at, startsOn, row.due_date, timezone) ? 1 : 0), 0);
    else if (goalKind === "revision") currentValue = progress.reduce((sum, item) => sum + (inDateWindow(item.revision_1_at, startsOn, row.due_date, timezone) ? 1 : 0) + (inDateWindow(item.revision_2_at, startsOn, row.due_date, timezone) ? 1 : 0), 0);
    else if (goalKind === "test") currentValue = progress.reduce((sum, item) => sum + (inDateWindow(item.test_1_at, startsOn, row.due_date, timezone) ? 1 : 0) + (inDateWindow(item.test_2_at, startsOn, row.due_date, timezone) ? 1 : 0), 0);
    else currentValue = row.status === "completed" ? targetValue : 0;
    return {
      id: row.id, title: row.title, description: row.description, dueDate: row.due_date, status: row.status as PlannerGoal["status"], completedAt: row.completed_at,
      goalKind, targetValue, targetUnit, startsOn: row.starts_on, currentValue, progressPercent: Math.max(0, Math.min(100, Math.round((currentValue / targetValue) * 100))),
    };
  });
}

function countdownMilestone(days: number | null): AttemptCountdown["milestone"] {
  if (days === null) return "unavailable";
  if (days < 0) return "past";
  if (days === 0) return "today";
  if (days <= 7) return "7";
  if (days <= 15) return "15";
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  if (days <= 90) return "90";
  return "normal";
}

export async function getSelectedAttemptCountdown(userId: string, now = new Date(), db = getD1RuntimeDatabase()): Promise<AttemptCountdown> {
  const row = await db.prepare(`SELECT p.attempt_key,p.timezone,ea.id AS attempt_id,ea.label,ea.start_date,ea.end_date,
    (SELECT MIN(ee.event_date) FROM exam_events ee WHERE ee.attempt_id=ea.id AND ee.verification_status='verified') AS first_event_date,
    (SELECT MAX(ee.event_date) FROM exam_events ee WHERE ee.attempt_id=ea.id AND ee.verification_status='verified') AS last_event_date,
    ade.estimated_date,ade.estimated_end_date
    FROM profiles p JOIN course_levels l ON l.code=p.ca_level
    LEFT JOIN exam_attempts ea ON ea.level_id=l.id AND ea.attempt_key=p.attempt_key AND ea.verification_status='verified'
    LEFT JOIN admin_exam_date_estimates ade ON ade.level_code=l.code AND ade.attempt_key=p.attempt_key AND ade.group_choice=p.group_choice
    WHERE p.user_id=?1 AND p.onboarding_completed_at IS NOT NULL LIMIT 1`).bind(userId).first<{ attempt_key: string | null; timezone: string; attempt_id: string | null; label: string | null; start_date: string | null; end_date: string | null; first_event_date: string | null; last_event_date: string | null; estimated_date: string | null; estimated_end_date: string | null }>();
  if (!row?.attempt_key) return { attemptKey: row?.attempt_key ?? null, attemptLabel: row?.label ?? null, anchorDate: null, endDate: null, daysRemaining: null, milestone: "unavailable", periodStatus: "unavailable", source: "unavailable" };
  const anchorDate = row.first_event_date ?? row.start_date ?? row.estimated_date;
  const endDate = row.last_event_date ?? row.end_date ?? row.estimated_end_date ?? row.estimated_date ?? anchorDate;
  if (!anchorDate || !endDate) return { attemptKey: row.attempt_key, attemptLabel: row.label, anchorDate: null, endDate: null, daysRemaining: null, milestone: "unavailable", periodStatus: "unavailable", source: "unavailable" };
  const today = dateKeyInTimezone(row.timezone, now);
  const periodStatus = today > endDate ? "completed" : today >= anchorDate ? "exam_period" : "upcoming";
  const daysRemaining = periodStatus === "upcoming" ? localDaysBetween(today, anchorDate) : null;
  const source = row.first_event_date ? "verified_exam_event" : row.start_date ? "verified_attempt" : "admin_estimate";
  return { attemptKey: row.attempt_key, attemptLabel: row.label, anchorDate, endDate, daysRemaining, milestone: countdownMilestone(daysRemaining), periodStatus, source };
}

const DEFAULT_PREFERENCES: NotificationPreferences = { revisionDue: true, testTomorrow: true, goalNearCompletion: true, doubtAnswered: true, buddyActivity: false, frequency: "realtime", maxPerDay: 8 };

export async function getNotificationPreferences(userId: string, db = getD1RuntimeDatabase()): Promise<NotificationPreferences> {
  await db.prepare("INSERT OR IGNORE INTO notification_preferences(user_id) VALUES(?1)").bind(userId).run();
  const row = await db.prepare("SELECT revision_due,test_tomorrow,goal_near_completion,doubt_answered,buddy_activity,frequency,max_per_day FROM notification_preferences WHERE user_id=?1 LIMIT 1").bind(userId).first<{ revision_due: number; test_tomorrow: number; goal_near_completion: number; doubt_answered: number; buddy_activity: number; frequency: NotificationFrequency; max_per_day: number }>();
  if (!row) return DEFAULT_PREFERENCES;
  return { revisionDue: row.revision_due === 1, testTomorrow: row.test_tomorrow === 1, goalNearCompletion: row.goal_near_completion === 1, doubtAnswered: row.doubt_answered === 1, buddyActivity: row.buddy_activity === 1, frequency: FREQUENCIES.includes(row.frequency) ? row.frequency : "realtime", maxPerDay: Math.max(1, Math.min(20, Number(row.max_per_day || 8))) };
}

export async function updateNotificationPreferences(userId: string, input: Partial<NotificationPreferences>, db = getD1RuntimeDatabase()) {
  const current = await getNotificationPreferences(userId, db);
  const next = { ...current, ...input };
  if (!FREQUENCIES.includes(next.frequency)) throw new Error("Unsupported notification frequency.");
  next.maxPerDay = Math.max(1, Math.min(20, Math.round(Number(next.maxPerDay))));
  await db.prepare(`UPDATE notification_preferences SET revision_due=?1,test_tomorrow=?2,goal_near_completion=?3,doubt_answered=?4,buddy_activity=?5,frequency=?6,max_per_day=?7,updated_at=CURRENT_TIMESTAMP WHERE user_id=?8`)
    .bind(next.revisionDue ? 1 : 0, next.testTomorrow ? 1 : 0, next.goalNearCompletion ? 1 : 0, next.doubtAnswered ? 1 : 0, next.buddyActivity ? 1 : 0, next.frequency, next.maxPerDay, userId).run();
  return next;
}

async function refreshNotifications(userId: string, timezone: string, goals: PlannerGoal[], db: D1DatabaseLike) {
  const prefs = await getNotificationPreferences(userId, db);
  if (prefs.frequency === "off") return prefs;
  const now = new Date();
  const today = dateKeyInTimezone(timezone, now);
  const tomorrow = shiftDateKey(today, 1);
  const recentSince = new Date(now.valueOf() - 48 * 60 * 60 * 1000).toISOString();
  const [revisionResult, taskResult, doubtResult, recentResult] = await db.batch([
    db.prepare("SELECT id,chapter_id,revision_number,due_at FROM revision_due_items WHERE user_id=?1 AND status='pending' AND due_at<=?2 ORDER BY due_at ASC LIMIT 20").bind(userId, now.toISOString()),
    db.prepare(`SELECT t.id,t.title,t.due_at,e.schedule_mode,e.target_date FROM tasks t LEFT JOIN planner_task_phase8 e ON e.task_id=t.id AND e.user_id=t.user_id WHERE t.user_id=?1 AND t.status='todo' AND t.task_kind IN ('test','mock') ORDER BY t.due_at ASC LIMIT 100`).bind(userId),
    db.prepare("SELECT id,answered_at FROM study_session_doubts WHERE user_id=?1 AND status='answered' AND answered_at IS NOT NULL ORDER BY answered_at DESC LIMIT 20").bind(userId),
    db.prepare("SELECT id,notification_type,title,body,action_href,read_at,created_at,dedupe_key FROM in_app_notifications WHERE user_id=?1 AND created_at>=?2 ORDER BY created_at DESC LIMIT 100").bind(userId, recentSince),
  ]);
  const candidates: NotificationCandidate[] = [];
  if (prefs.testTomorrow) for (const row of (taskResult?.results ?? []) as { id: string; title: string; due_at: string; schedule_mode: TaskScheduleMode | null; target_date: string | null }[]) {
    const taskDate = row.schedule_mode === "flexible" && row.target_date ? row.target_date : dateKeyInTimezone(timezone, row.due_at);
    if (taskDate === tomorrow) candidates.push({ notification_type: "test_tomorrow", title: "Test tomorrow", body: row.title, action_href: "/planner", dedupeKey: `test-tomorrow:${row.id}:${tomorrow}`, entityType: "task", entityId: row.id });
  }
  if (prefs.revisionDue) for (const row of (revisionResult?.results ?? []) as { id: string; chapter_id: string; revision_number: number; due_at: string }[]) candidates.push({ notification_type: "revision_due", title: "Revision due", body: `Revision ${row.revision_number} is ready for today.`, action_href: "/planner/today", dedupeKey: `revision-due:${row.id}`, entityType: "revision_due_item", entityId: row.id });
  if (prefs.doubtAnswered) for (const row of (doubtResult?.results ?? []) as { id: string; answered_at: string }[]) candidates.push({ notification_type: "doubt_answered", title: "Your doubt has an answer", body: "Open Community to review the reply to your shared doubt.", action_href: "/community", dedupeKey: `doubt-answered:${row.id}:${row.answered_at}`, entityType: "study_session_doubt", entityId: row.id });
  if (prefs.goalNearCompletion) for (const goal of goals.filter((item) => item.status === "active" && item.progressPercent >= 80 && item.progressPercent < 100)) candidates.push({ notification_type: "goal_near_completion", title: "Goal almost complete", body: `${goal.title} is ${goal.progressPercent}% complete.`, action_href: "/goals", dedupeKey: `goal-near:${goal.id}:${goal.progressPercent}`, entityType: "goal", entityId: goal.id });
  // Buddy activity is opt-in infrastructure only in Product Phase 8. No Buddy event is
  // synthesized before the later Buddy phase has a real user-owned activity source.
  const recent = (recentResult?.results ?? []) as Array<NotificationRow & { dedupe_key: string }>;
  const createdToday = recent.filter((row) => dateKeyInTimezone(timezone, row.created_at) === today).length;
  const existing = new Set(recent.map((row) => row.dedupe_key));
  const dailyBudget = Math.max(0, prefs.maxPerDay - createdToday);
  const fresh = candidates.filter((candidate) => !existing.has(candidate.dedupeKey)).slice(0, dailyBudget);
  if (fresh.length) await db.batch(fresh.map((candidate) => db.prepare("INSERT OR IGNORE INTO in_app_notifications(id,user_id,notification_type,title,body,action_href,entity_type,entity_id,dedupe_key) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(crypto.randomUUID(), userId, candidate.notification_type, candidate.title, candidate.body, candidate.action_href, candidate.entityType, candidate.entityId, candidate.dedupeKey)));
  return prefs;
}

export async function getPhase8NotificationCenter(userId: string, timezone: string, goals?: PlannerGoal[], db = getD1RuntimeDatabase()) {
  const goalRows = goals ?? await getPhase8GoalSummaries(userId, timezone, db);
  const preferences = await refreshNotifications(userId, timezone, goalRows, db);
  const rows = (await db.prepare("SELECT id,notification_type,title,body,action_href,read_at,created_at FROM in_app_notifications WHERE user_id=?1 ORDER BY created_at DESC LIMIT 30").bind(userId).all<NotificationRow>()).results ?? [];
  const notifications: PlannerNotification[] = rows.map((row) => ({ id: row.id, notificationType: row.notification_type, title: row.title, body: row.body, actionHref: row.action_href, readAt: row.read_at, createdAt: row.created_at }));
  return { preferences, notifications };
}

export async function markPhase8NotificationRead(userId: string, id: string | null, db = getD1RuntimeDatabase()) {
  if (id) await db.prepare("UPDATE in_app_notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=?1 AND user_id=?2").bind(id, userId).run();
  else await db.prepare("UPDATE in_app_notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE user_id=?1 AND read_at IS NULL").bind(userId).run();
  return { ok: true };
}

export async function getCurrentPhase8Snapshot() {
  const identity = await optionalUser();
  if (!identity) return null;
  const profile = await getProfileForUser(identity.id);
  if (!profile?.onboarding_completed_at || !profile.ca_level || !profile.attempt_key || profile.attempt_key === "undecided") return null;
  const timezone = safeTimeZone(profile.timezone);
  const [goals, countdown] = await Promise.all([getPhase8GoalSummaries(identity.id, timezone), getSelectedAttemptCountdown(identity.id)]);
  const center = await getPhase8NotificationCenter(identity.id, timezone, goals);
  return { timezone, goals, countdown, notifications: center.notifications, notificationPreferences: center.preferences };
}
