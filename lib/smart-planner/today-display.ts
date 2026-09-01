import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getTodayPlanPageModel } from "./service";
import type { TodayPlanItem, TodayPlanPageModel, TodayPlanReadyModel } from "./types";

export type TodayPlanScheduleState = "overdue" | "fixed" | "planned" | null;

export type TodayPlanDisplayItem = TodayPlanItem & {
  displayTitle: string;
  chapterDisplayTitle: string | null;
  plannedStartAt: string | null;
  scheduleState: TodayPlanScheduleState;
};

export type TodayPlanDisplayModel = Omit<TodayPlanReadyModel, "items"> & {
  items: TodayPlanDisplayItem[];
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
  return { label: `${numbered} · ${chapter.title}`, title: chapter.title };
}

function displayTitle(item: TodayPlanItem, chapter: ChapterDisplay | null) {
  if (!chapter) return item.title;
  if (item.itemKind === "revision") return `Revision ${item.revisionNumber ?? ""}: ${chapter.label}`.replace("Revision :", "Revision:");
  if (item.itemKind === "test") return `Test ${item.testNumber ?? ""}: ${chapter.label}`.replace("Test :", "Test:");
  if (item.itemKind === "new_chapter") return `Study: ${chapter.label}`;
  return item.title;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + Math.max(0, minutes) * 60_000);
}

function fixedTimeFor(item: TodayPlanItem, taskTimes: Map<string, string>) {
  if (item.scheduledAt) {
    const scheduled = new Date(item.scheduledAt);
    if (Number.isFinite(scheduled.getTime())) return scheduled;
  }
  if (item.sourceType === "task" && item.sourceId) {
    const raw = taskTimes.get(item.sourceId);
    if (raw) {
      const scheduled = new Date(raw);
      if (Number.isFinite(scheduled.getTime())) return scheduled;
    }
  }
  return null;
}

function organiseToday(items: TodayPlanDisplayItem[], taskTimes: Map<string, string>) {
  const now = new Date();
  const planned = items.filter((item) => item.status === "planned");
  const inactive = items.filter((item) => item.status !== "planned");

  const fixed = planned
    .map((item) => ({ item, at: fixedTimeFor(item, taskTimes) }))
    .filter((entry): entry is { item: TodayPlanDisplayItem; at: Date } => Boolean(entry.at))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const fixedIds = new Set(fixed.map((entry) => entry.item.id));
  const flexible = planned.filter((item) => !fixedIds.has(item.id)).sort((a, b) => a.position - b.position || b.priorityScore - a.priorityScore);

  const overdueFixed = fixed.filter((entry) => entry.at <= now);
  const futureFixed = fixed.filter((entry) => entry.at > now);
  const result: TodayPlanDisplayItem[] = [];
  let cursor = new Date(now);

  for (const entry of overdueFixed) {
    result.push({ ...entry.item, plannedStartAt: entry.at.toISOString(), scheduleState: "overdue" });
    cursor = addMinutes(cursor, entry.item.estimatedMinutes);
  }

  for (const anchor of futureFixed) {
    while (flexible.length) {
      const availableMinutes = Math.max(0, Math.floor((anchor.at.getTime() - cursor.getTime()) / 60_000));
      const fittingIndex = flexible.findIndex((item) => item.estimatedMinutes <= availableMinutes);
      if (fittingIndex < 0) break;
      const [next] = flexible.splice(fittingIndex, 1);
      result.push({ ...next, plannedStartAt: cursor.toISOString(), scheduleState: "planned" });
      cursor = addMinutes(cursor, next.estimatedMinutes);
    }

    result.push({ ...anchor.item, plannedStartAt: anchor.at.toISOString(), scheduleState: "fixed" });
    const anchorEnd = addMinutes(anchor.at, anchor.item.estimatedMinutes);
    if (anchorEnd > cursor) cursor = anchorEnd;
  }

  for (const item of flexible) {
    result.push({ ...item, plannedStartAt: cursor.toISOString(), scheduleState: "planned" });
    cursor = addMinutes(cursor, item.estimatedMinutes);
  }

  return [...result, ...inactive.map((item) => ({ ...item, plannedStartAt: fixedTimeFor(item, taskTimes)?.toISOString() ?? null, scheduleState: null }))];
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

  const displayItems: TodayPlanDisplayItem[] = base.items.map((item) => {
    const chapter = item.chapterId ? chapterLabels.get(item.chapterId) ?? null : null;
    return {
      ...item,
      displayTitle: displayTitle(item, chapter),
      chapterDisplayTitle: chapter?.label ?? null,
      plannedStartAt: null,
      scheduleState: null,
    };
  });

  return { ...base, items: organiseToday(displayItems, taskTimes) };
}
