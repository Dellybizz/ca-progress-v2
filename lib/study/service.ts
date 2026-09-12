import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getStudentContext, selectionForAcademicQuery } from "@/lib/academic/student-context";
import { optionalUser } from "@/lib/auth/server";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { getHotStudySessions, getHotStudyTimer } from "@/lib/data/d1/hot-screens";
import type { Database } from "@/lib/data/database.types";
import { getPendingStudyReflection } from "./phase3";
import type {
  StudyAnalytics,
  StudyPageModel,
  StudyPendingReflection,
  StudySessionItem,
  StudySubjectOption,
  StudyTaskOption,
  StudyTimerSnapshot,
} from "./types";

type SessionRow = Database["public"]["Tables"]["study_sessions"]["Row"];
type TimerRow = Database["public"]["Tables"]["study_timer_state"]["Row"];
type SessionMetaRow = {
  session_id: string;
  task_id: string | null;
  plan_item_id: string | null;
  pause_count: number;
  paused_seconds: number;
  completion_state: "completed" | "recovered";
  understanding_score: number | null;
  focus_rating: "poor" | "okay" | "focused" | null;
  reflection_saved_at: string | null;
  intended_task_title: string | null;
};
type TimerMetaRow = {
  task_id: string | null;
  plan_item_id: string | null;
  pause_count: number;
  paused_seconds: number;
  intended_task_title: string | null;
};
type TaskRow = { id: string; title: string; task_kind: string; subject_id: string | null; chapter_id: string | null; due_at: string };

const DAY_MS = 86_400_000;

function safeTimeZone(timezone: string | null | undefined) {
  if (!timezone) return "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date()); return timezone; } catch { return "UTC"; }
}

function localDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTimeZone(timezone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function groupLabel(groupChoice: string, groups: Array<{ code: string; name: string }>) {
  if (groupChoice === "both") return "Both groups";
  if (groupChoice === "not_applicable") return groups[0]?.name ?? "All papers";
  return groups.find((group) => group.code === groupChoice)?.name ?? groupChoice.replaceAll("_", " ");
}

function elapsedTimer(row: TimerRow, now: Date) {
  const running = row.status === "running" && row.running_since ? Math.max(0, Math.floor((now.valueOf() - Date.parse(row.running_since)) / 1000)) : 0;
  return Math.min(43_200, Math.max(0, row.elapsed_seconds + running));
}

function dayDistance(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function streakDays(dayKeys: string[], today: string) {
  const days = [...new Set(dayKeys)].sort().reverse();
  if (!days.length || dayDistance(days[0], today) > 1) return 0;
  let streak = 1;
  for (let index = 1; index < days.length; index += 1) {
    if (dayDistance(days[index], days[index - 1]) !== 1) break;
    streak += 1;
  }
  return streak;
}

async function sessionMetadata(userId: string, sessionIds: string[]) {
  if (!sessionIds.length) return new Map<string, SessionMetaRow>();
  const db = getD1RuntimeDatabase();
  const ids = sessionIds.slice(0, 600);
  const placeholders = ids.map((_, index) => `?${index + 2}`).join(",");
  const rows = await db.prepare(`SELECT x.session_id,x.task_id,x.plan_item_id,x.pause_count,x.paused_seconds,x.completion_state,x.understanding_score,x.focus_rating,x.reflection_saved_at,
      COALESCE(t.title,dpi.title) AS intended_task_title
    FROM study_session_phase3 x
    LEFT JOIN tasks t ON t.id=x.task_id AND t.user_id=x.user_id
    LEFT JOIN daily_plan_items dpi ON dpi.id=x.plan_item_id AND dpi.user_id=x.user_id
    WHERE x.user_id=?1 AND x.session_id IN (${placeholders})`).bind(userId, ...ids).all<SessionMetaRow>();
  return new Map((rows.results ?? []).map((row) => [row.session_id, row]));
}

function sessionItem(row: SessionRow, subjectNames: Map<string, string>, chapterNames: Map<string, string>, meta?: SessionMetaRow): StudySessionItem {
  return {
    id: row.id,
    subjectId: row.subject_id,
    chapterId: row.chapter_id,
    subjectTitle: row.subject_id ? subjectNames.get(row.subject_id) ?? null : null,
    chapterTitle: row.chapter_id ? chapterNames.get(row.chapter_id) ?? null : null,
    taskId: meta?.task_id ?? null,
    planItemId: meta?.plan_item_id ?? null,
    intendedTaskTitle: meta?.intended_task_title ?? null,
    pauseCount: Number(meta?.pause_count ?? 0),
    pausedSeconds: Number(meta?.paused_seconds ?? 0),
    completionState: meta?.completion_state ?? "completed",
    understandingScore: meta?.understanding_score ?? null,
    focusRating: meta?.focus_rating ?? null,
    reflectionSavedAt: meta?.reflection_saved_at ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    mode: row.mode as StudySessionItem["mode"],
    timezone: row.timezone,
  };
}

export async function getStudyAnalytics(userId: string, options?: { now?: Date; subjectNames?: Map<string, string>; chapterNames?: Map<string, string>; timezone?: string }): Promise<StudyAnalytics> {
  const now = options?.now ?? new Date();
  const since = new Date(now.valueOf() - 60 * DAY_MS).toISOString();
  const rows = (await getHotStudySessions(userId, since)) as SessionRow[];
  const metadata = await sessionMetadata(userId, rows.map((row) => row.id));
  const subjectNames = options?.subjectNames ?? new Map<string, string>();
  const chapterNames = options?.chapterNames ?? new Map<string, string>();
  const timezone = safeTimeZone(options?.timezone ?? rows[0]?.timezone ?? "UTC");
  const today = localDateKey(now, timezone);
  const sevenDayCutoff = now.valueOf() - 7 * DAY_MS;
  const last7 = rows.filter((row) => Date.parse(row.ended_at) >= sevenDayCutoff);
  const localKeys = rows.map((row) => localDateKey(new Date(row.ended_at), row.timezone || timezone));
  const dailyMap = new Map<string, number>();
  for (const row of last7) {
    const key = localDateKey(new Date(row.ended_at), row.timezone || timezone);
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + row.duration_seconds);
  }
  const daily = [...dailyMap.entries()].map(([date, seconds]) => ({ date, seconds })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    todaySeconds: rows.filter((row) => localDateKey(new Date(row.ended_at), row.timezone || timezone) === today).reduce((sum, row) => sum + row.duration_seconds, 0),
    last7DaysSeconds: last7.reduce((sum, row) => sum + row.duration_seconds, 0),
    sessionCountLast7Days: last7.length,
    streakDays: streakDays(localKeys, today),
    daily,
    recentSessions: rows.slice(0, 10).map((row) => sessionItem(row, subjectNames, chapterNames, metadata.get(row.id))),
  };
}

export async function getStudyPageModel(now = new Date(), preferredReflectionSessionId?: string | null): Promise<StudyPageModel> {
  const context = await getStudentContext();
  if (context.mode === "guest") return { mode: "guest" };
  const name = context.displayName;
  if (context.mode !== "ready" || !context.selection || !context.userId) return { mode: "setup", viewerName: name };
  const identity = { id: context.userId };
  const catalog = await getAcademicCatalog(selectionForAcademicQuery(context));
  const subjects: StudySubjectOption[] = catalog.subjects.map((subject) => ({ id: subject.id, slug: subject.slug, title: subject.title, chapters: subject.chapters.map((chapter) => ({ id: chapter.id, number: chapter.number, title: chapter.title })) }));
  const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.title]));
  const chapterNames = new Map(subjects.flatMap((subject) => subject.chapters.map((chapter) => [chapter.id, chapter.title] as const)));
  const db = getD1RuntimeDatabase();
  const [timerRowRaw, tasksResult, pendingRow] = await Promise.all([
    getHotStudyTimer(identity.id),
    db.prepare(`SELECT id,title,task_kind,subject_id,chapter_id,due_at FROM tasks WHERE user_id=?1 AND status='todo' ORDER BY due_at ASC LIMIT 160`).bind(identity.id).all<TaskRow>(),
    getPendingStudyReflection(identity.id, preferredReflectionSessionId),
  ]);
  const timerRow = timerRowRaw as TimerRow | null;
  const analytics = await getStudyAnalytics(identity.id, { now, subjectNames, chapterNames, timezone: timerRow?.timezone });
  const tasks: StudyTaskOption[] = (tasksResult.results ?? []).map((row) => ({ id: row.id, title: row.title, taskKind: row.task_kind, subjectId: row.subject_id, chapterId: row.chapter_id, dueAt: row.due_at }));

  const timerMeta = timerRow ? await db.prepare(`SELECT x.task_id,x.plan_item_id,x.pause_count,x.paused_seconds,COALESCE(t.title,dpi.title) AS intended_task_title
    FROM study_timer_phase3 x LEFT JOIN tasks t ON t.id=x.task_id AND t.user_id=x.user_id LEFT JOIN daily_plan_items dpi ON dpi.id=x.plan_item_id AND dpi.user_id=x.user_id
    WHERE x.user_id=?1 LIMIT 1`).bind(identity.id).first<TimerMetaRow>() : null;
  const timer: StudyTimerSnapshot | null = timerRow ? {
    status: timerRow.status as StudyTimerSnapshot["status"],
    mode: timerRow.mode as StudyTimerSnapshot["mode"],
    subjectId: timerRow.subject_id,
    chapterId: timerRow.chapter_id,
    subjectTitle: timerRow.subject_id ? subjectNames.get(timerRow.subject_id) ?? null : null,
    chapterTitle: timerRow.chapter_id ? chapterNames.get(timerRow.chapter_id) ?? null : null,
    taskId: timerMeta?.task_id ?? null,
    planItemId: timerMeta?.plan_item_id ?? null,
    intendedTaskTitle: timerMeta?.intended_task_title ?? null,
    pauseCount: Number(timerMeta?.pause_count ?? 0),
    pausedSeconds: Number(timerMeta?.paused_seconds ?? 0),
    focusTargetSeconds: timerRow.focus_target_seconds,
    breakTargetSeconds: timerRow.break_target_seconds,
    startedAt: timerRow.started_at,
    runningSince: timerRow.running_since,
    elapsedSeconds: elapsedTimer(timerRow, now),
    storedElapsedSeconds: Number(timerRow.elapsed_seconds),
    pausedAt: timerRow.paused_at,
    timezone: timerRow.timezone,
    lastInteractionAt: timerRow.last_interaction_at,
    abandoned: elapsedTimer(timerRow, now) >= 43_200 || now.valueOf() - Date.parse(timerRow.last_interaction_at) > 16 * 60 * 60 * 1000,
  } : null;

  const pendingReflection: StudyPendingReflection | null = pendingRow ? {
    sessionId: pendingRow.id,
    subjectId: pendingRow.subject_id,
    chapterId: pendingRow.chapter_id,
    subjectTitle: pendingRow.subject_id ? subjectNames.get(pendingRow.subject_id) ?? null : null,
    chapterTitle: pendingRow.chapter_id ? chapterNames.get(pendingRow.chapter_id) ?? null : null,
    intendedTaskTitle: pendingRow.intended_task_title,
    durationSeconds: Number(pendingRow.duration_seconds),
    endedAt: pendingRow.ended_at,
  } : null;

  return { mode: "ready", viewerName: name, levelName: catalog.selectedLevel.name, groupLabel: groupLabel(context.selection.group, catalog.groups), attemptKey: context.selection.attemptKey, subjects, tasks, timer, pendingReflection, analytics };
}

export async function getPendingStudyReflectionPrompt(preferredSessionId?: string | null) {
  const identity = await optionalUser();
  if (!identity) return null;
  return getPendingStudyReflection(identity.id, preferredSessionId);
}

export async function getStudyDashboardSummary(userId: string, now = new Date()) {
  const analytics = await getStudyAnalytics(userId, { now });
  return {
    studiedLast7DaysMinutes: Math.round(analytics.last7DaysSeconds / 60),
    studiedTodayMinutes: Math.round(analytics.todaySeconds / 60),
    streakDays: analytics.streakDays,
    sessionCountLast7Days: analytics.sessionCountLast7Days,
  };
}
