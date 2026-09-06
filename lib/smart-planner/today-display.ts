import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { createD1AdminClient } from "@/lib/data/d1/client";
import { buildFirstWeekPrompt, type FirstWeekPrompt } from "@/lib/product/first-week";
import { getTodayPlanPageModel } from "./service";
import { getTodayPlanStartedTimes, getTodayPlanUndoState } from "./today-interactions";
import type { TodayPlanItem, TodayPlanPageModel, TodayPlanReadyModel } from "./types";

export type TodayPlanScheduleState = "overdue" | "fixed" | "planned" | null;

export type TodayPlanDisplayItem = TodayPlanItem & {
  displayTitle: string;
  chapterDisplayTitle: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  scheduleState: TodayPlanScheduleState;
  startedAt: string | null;
};

export type TodayPlanDisplayModel = Omit<TodayPlanReadyModel, "items"> & {
  items: TodayPlanDisplayItem[];
  canUndo: boolean;
  completedStudyMinutes: number;
  daysRemaining: number | null;
  evidenceMode: "starter" | "recorded";
  firstWeek: FirstWeekPrompt | null;
};

type TaskScheduleRow = { id: string; due_at: string };
type SessionEvidenceRow = { duration_seconds: number; ended_at: string; subject_id: string | null; chapter_id: string | null };
type ProgressEvidenceRow = { chapter_id: string; completed_at: string | null; revision_1_at: string | null; revision_2_at: string | null; test_1_at: string | null; test_2_at: string | null };
type CompletedPlanRow = { id: string; completed_at: string | null };

type ChapterDisplay = {
  label: string;
  title: string;
};

function chapterPrefix(kind: string, sectionKey: string | null, number: string) {
  const searchable = `${kind} ${sectionKey ?? ""} ${number}`.toLowerCase();
  if (/accounting[ _-]?standard|\bas\b/.test(searchable)) return "AS";
  if (/\bunit\b/.test(searchable)) return "Unit";
  return "Chapter";
}

function chapterDisplayLabel(chapter: { number: string; title: string; kind: string; sectionKey: string | null }): ChapterDisplay {
  const rawNumber = chapter.number?.trim() || "";
  const prefix = chapterPrefix(chapter.kind, chapter.sectionKey, rawNumber);
  const normalizedNumber = rawNumber.replace(/^(chapter|unit|as)\s*/i, "").trim();
  const numbered = normalizedNumber ? `${prefix} ${normalizedNumber}` : prefix;
  const title = chapter.title.trim();
  return { label: title.toLowerCase().startsWith(numbered.toLowerCase()) ? title : `${numbered} · ${title}`, title };
}

function displayTitle(item: TodayPlanItem, chapter: ChapterDisplay | null) {
  if (!chapter) return item.title;
  if (item.itemKind === "revision") return `Revision ${item.revisionNumber ?? ""}: ${chapter.label}`.replace("Revision :", "Revision:");
  if (item.itemKind === "test") return `Test ${item.testNumber ?? ""}: ${chapter.label}`.replace("Test :", "Test:");
  if (item.itemKind === "new_chapter") return chapter.label;
  return item.title;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + Math.max(1, minutes) * 60_000);
}

function fixedTimeFor(item: TodayPlanItem) {
  if (!item.scheduledAt) return null;
  const scheduled = new Date(item.scheduledAt);
  return Number.isFinite(scheduled.getTime()) ? scheduled : null;
}

function dateKeyInTimezone(timezone: string, at: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minutesForDate(sessions: SessionEvidenceRow[], date: string, timezone: string) {
  return sessions.reduce((sum, session) => dateKeyInTimezone(timezone, new Date(session.ended_at)) === date ? sum + Math.round(session.duration_seconds / 60) : sum, 0);
}

function recordedStreak(sessions: SessionEvidenceRow[], today: string, timezone: string) {
  const dates = new Set(sessions.map((session) => dateKeyInTimezone(timezone, new Date(session.ended_at))));
  let streak = 0;
  let cursor = today;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

function daysRemaining(anchor: string | null, today: string) {
  if (!anchor) return null;
  const attempt = new Date(`${anchor}T12:00:00.000Z`);
  const current = new Date(`${today}T12:00:00.000Z`);
  if (!Number.isFinite(attempt.valueOf()) || !Number.isFinite(current.valueOf())) return null;
  return Math.max(0, Math.ceil((attempt.valueOf() - current.valueOf()) / 86_400_000));
}

function hasRecordedEvidence(progress: ProgressEvidenceRow[], sessions: SessionEvidenceRow[]) {
  return sessions.length > 0 || progress.some((row) => Boolean(row.completed_at || row.revision_1_at || row.revision_2_at || row.test_1_at || row.test_2_at));
}

function honestStarterItem(item: TodayPlanItem): TodayPlanItem {
  if (item.reasonCode !== "weak_subject_new_work") return item;
  return {
    ...item,
    reasonCode: "remaining_syllabus",
    reasonText: "This is unfinished syllabus work for your selected attempt. No performance claim is being made yet.",
    priorityScore: Math.max(0, item.priorityScore - 14),
  };
}

function organiseToday(items: TodayPlanDisplayItem[]) {
  const now = new Date();
  const planned = items.filter((item) => item.status === "planned");
  const inactive = items.filter((item) => item.status !== "planned");
  const fixed = planned.map((item) => ({ item, at: fixedTimeFor(item) })).filter((entry): entry is { item: TodayPlanDisplayItem; at: Date } => Boolean(entry.at)).sort((a, b) => a.at.getTime() - b.at.getTime());
  const fixedIds = new Set(fixed.map((entry) => entry.item.id));
  const flexible = planned.filter((item) => !fixedIds.has(item.id)).sort((a, b) => a.position - b.position || b.priorityScore - a.priorityScore);
  const overdueFixed = fixed.filter((entry) => entry.at <= now);
  const futureFixed = fixed.filter((entry) => entry.at > now);
  const result: TodayPlanDisplayItem[] = [];
  let cursor = new Date(now);

  for (const entry of overdueFixed) {
    const start = new Date(cursor);
    const end = addMinutes(start, entry.item.estimatedMinutes);
    result.push({ ...entry.item, plannedStartAt: start.toISOString(), plannedEndAt: end.toISOString(), scheduleState: "overdue" });
    cursor = end;
  }

  for (const anchor of futureFixed) {
    while (flexible.length) {
      const availableMinutes = Math.max(0, Math.floor((anchor.at.getTime() - cursor.getTime()) / 60_000));
      const fittingIndex = flexible.findIndex((item) => item.estimatedMinutes <= availableMinutes);
      if (fittingIndex < 0) break;
      const [next] = flexible.splice(fittingIndex, 1);
      const start = new Date(cursor);
      const end = addMinutes(start, next.estimatedMinutes);
      result.push({ ...next, plannedStartAt: start.toISOString(), plannedEndAt: end.toISOString(), scheduleState: "planned" });
      cursor = end;
    }
    const end = addMinutes(anchor.at, anchor.item.estimatedMinutes);
    result.push({ ...anchor.item, plannedStartAt: anchor.at.toISOString(), plannedEndAt: end.toISOString(), scheduleState: "fixed" });
    if (end > cursor) cursor = end;
  }

  for (const item of flexible) {
    const start = new Date(cursor);
    const end = addMinutes(start, item.estimatedMinutes);
    result.push({ ...item, plannedStartAt: start.toISOString(), plannedEndAt: end.toISOString(), scheduleState: "planned" });
    cursor = end;
  }

  return [...result, ...inactive.map((item) => ({ ...item, plannedStartAt: fixedTimeFor(item)?.toISOString() ?? null, plannedEndAt: null, scheduleState: null }))];
}

export async function getTodayPlanDisplayModel(): Promise<TodayPlanPageModel | TodayPlanDisplayModel> {
  const base = await getTodayPlanPageModel();
  if (base.mode !== "ready") return base;

  const identity = await optionalUser();
  if (!identity) return base;
  const profile = await getProfileForUser(identity.id);
  if (!profile?.ca_level || !profile.group_choice || !profile.attempt_key) return base;

  const catalog = await getAcademicCatalog({ level: profile.ca_level, group: profile.group_choice, attempt: profile.attempt_key });
  const chapterLabels = new Map<string, ChapterDisplay>();
  for (const subject of catalog.subjects) for (const chapter of subject.chapters) chapterLabels.set(chapter.id, chapterDisplayLabel(chapter));

  const admin = createD1AdminClient();
  const taskIds = base.items.filter((item) => item.sourceType === "task" && item.sourceId).map((item) => item.sourceId as string);
  const lookback = new Date(Date.now() - 28 * 86_400_000).toISOString();
  const completedSince = profile.onboarding_completed_at ?? lookback;
  const [tasks, sessionsResult, progressResult, completedPlanResult, startedTimes, canUndo] = await Promise.all([
    taskIds.length ? admin.from("tasks").select("id,due_at").eq("user_id", identity.id).in("id", taskIds) : Promise.resolve({ data: [], error: null }),
    admin.from("study_sessions").select("duration_seconds,ended_at,subject_id,chapter_id").eq("user_id", identity.id).gte("ended_at", lookback).order("ended_at", { ascending: false }).limit(500),
    admin.from("chapter_progress").select("chapter_id,completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at").eq("user_id", identity.id),
    admin.from("daily_plan_items").select("id,completed_at").eq("user_id", identity.id).eq("status", "completed").gte("completed_at", completedSince).limit(500),
    getTodayPlanStartedTimes(identity.id, base.items.map((item) => item.id)),
    getTodayPlanUndoState(identity.id),
  ]);

  const taskTimes = new Map<string, string>();
  if (!tasks.error) for (const task of (tasks.data ?? []) as TaskScheduleRow[]) taskTimes.set(task.id, task.due_at);
  const sessions = sessionsResult.error ? [] : (sessionsResult.data ?? []) as SessionEvidenceRow[];
  const progress = progressResult.error ? [] : (progressResult.data ?? []) as ProgressEvidenceRow[];
  const completedPlanItems = completedPlanResult.error ? [] : (completedPlanResult.data ?? []) as CompletedPlanRow[];
  const evidenceMode = hasRecordedEvidence(progress, sessions) ? "recorded" : "starter";
  const safeItems = evidenceMode === "starter" ? base.items.map(honestStarterItem) : base.items;
  const safeWeakSubjects = evidenceMode === "starter" ? [] : base.weakSubjects;

  const displayItems: TodayPlanDisplayItem[] = safeItems.map((item) => {
    const chapter = item.chapterId ? chapterLabels.get(item.chapterId) ?? null : null;
    const taskScheduledAt = item.sourceType === "task" && item.sourceId ? taskTimes.get(item.sourceId) ?? null : null;
    return {
      ...item,
      scheduledAt: taskScheduledAt ?? item.scheduledAt,
      displayTitle: displayTitle(item, chapter),
      chapterDisplayTitle: chapter?.label ?? null,
      plannedStartAt: null,
      plannedEndAt: null,
      scheduleState: null,
      startedAt: startedTimes.get(item.id) ?? null,
    };
  });

  const todayStudyMinutes = minutesForDate(sessions, base.planDate, profile.timezone);
  const yesterday = shiftDateKey(base.planDate, -1);
  const yesterdayStudyMinutes = minutesForDate(sessions, yesterday, profile.timezone);
  const firstWeekStart = profile.onboarding_completed_at ? new Date(profile.onboarding_completed_at).valueOf() : 0;
  const weekSessions = firstWeekStart ? sessions.filter((session) => new Date(session.ended_at).valueOf() >= firstWeekStart) : [];
  const weekStudyMinutes = weekSessions.reduce((sum, session) => sum + Math.round(session.duration_seconds / 60), 0);
  const completedChapters = progress.filter((row) => Boolean(row.completed_at)).length;
  const totalChapters = catalog.subjects.reduce((sum, subject) => sum + subject.chapters.length, 0);
  const firstWeek = buildFirstWeekPrompt({
    onboardingCompletedAt: profile.onboarding_completed_at,
    today: base.planDate,
    timezone: profile.timezone,
    yesterdayStudyMinutes,
    streakDays: recordedStreak(sessions, base.planDate, profile.timezone),
    weekStudyMinutes,
    completedPlanItems: completedPlanItems.length,
    completedChapters,
    totalChapters,
  });

  return {
    ...base,
    items: organiseToday(displayItems),
    weakSubjects: safeWeakSubjects,
    canUndo,
    completedStudyMinutes: todayStudyMinutes,
    daysRemaining: daysRemaining(base.forecast.attemptAnchorDate, base.planDate),
    evidenceMode,
    firstWeek,
  };
}
