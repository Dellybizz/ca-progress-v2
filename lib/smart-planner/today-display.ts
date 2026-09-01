import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
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
};

type TaskScheduleRow = { id: string; due_at: string };

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

function organiseToday(items: TodayPlanDisplayItem[]) {
  const now = new Date();
  const planned = items.filter((item) => item.status === "planned");
  const inactive = items.filter((item) => item.status !== "planned");

  const fixed = planned
    .map((item) => ({ item, at: fixedTimeFor(item) }))
    .filter((entry): entry is { item: TodayPlanDisplayItem; at: Date } => Boolean(entry.at))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
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

  const catalog = await getAcademicCatalog({
    level: profile.ca_level,
    group: profile.group_choice,
    attempt: profile.attempt_key,
  });

  const chapterLabels = new Map<string, ChapterDisplay>();
  for (const subject of catalog.subjects) {
    for (const chapter of subject.chapters) chapterLabels.set(chapter.id, chapterDisplayLabel(chapter));
  }

  const taskIds = base.items
    .filter((item) => item.sourceType === "task" && item.sourceId)
    .map((item) => item.sourceId as string);
  const taskTimes = new Map<string, string>();
  if (taskIds.length) {
    const admin = createAdminSupabaseClient();
    const tasks = await admin.from("tasks").select("id,due_at").eq("user_id", identity.id).in("id", taskIds);
    if (!tasks.error) {
      for (const task of (tasks.data ?? []) as TaskScheduleRow[]) taskTimes.set(task.id, task.due_at);
    }
  }

  const [startedTimes, canUndo] = await Promise.all([
    getTodayPlanStartedTimes(identity.id, base.items.map((item) => item.id)),
    getTodayPlanUndoState(identity.id),
  ]);

  const displayItems: TodayPlanDisplayItem[] = base.items.map((item) => {
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

  return { ...base, items: organiseToday(displayItems), canUndo };
}
