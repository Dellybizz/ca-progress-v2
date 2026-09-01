import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser } from "@/lib/auth/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { AcademicChapter } from "@/lib/academic/types";
import type { TodayPlanItem, TodayPlanReadyModel } from "./types";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

function chapterDisplay(chapter: AcademicChapter | undefined) {
  if (!chapter) return null;
  const title = chapter.title.trim();
  const number = chapter.number?.trim();
  if (!number) return title;

  const kind = chapter.kind.toLowerCase();
  const numberIsAs = /^as\b/i.test(number);
  const titleIsAs = /^as\b/i.test(title);
  const isAs = kind.includes("accounting") || kind.includes("standard") || numberIsAs || titleIsAs;
  const isUnit = kind.includes("unit");

  let prefix: string;
  if (isAs) prefix = numberIsAs ? number : `AS ${number}`;
  else if (isUnit) prefix = /^unit\b/i.test(number) ? number : `Unit ${number}`;
  else prefix = /^chapter\b/i.test(number) ? number : `Chapter ${number}`;

  if (title.toLowerCase().startsWith(prefix.toLowerCase())) return title;
  return `${prefix} · ${title}`;
}

function durationMs(item: TodayPlanItem) {
  return Math.max(1, item.estimatedMinutes) * 60_000;
}

function scheduleItems(items: TodayPlanItem[]) {
  const now = Date.now();
  const active = items.filter((item) => item.status === "planned");
  const inactive = items.filter((item) => item.status !== "planned");
  const lapsed = active
    .filter((item) => item.scheduledAt && new Date(item.scheduledAt).getTime() <= now)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  const fixed = active
    .filter((item) => item.scheduledAt && new Date(item.scheduledAt).getTime() > now)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  const flexible = active
    .filter((item) => !item.scheduledAt)
    .sort((a, b) => a.position - b.position || b.priorityScore - a.priorityScore);

  const scheduled: TodayPlanItem[] = [];
  let cursor = now;

  for (const item of lapsed) {
    const start = cursor;
    const end = start + durationMs(item);
    scheduled.push({ ...item, scheduleState: "lapsed", plannedStartAt: new Date(start).toISOString(), plannedEndAt: new Date(end).toISOString() });
    cursor = end;
  }

  for (const fixedItem of fixed) {
    const fixedStart = new Date(fixedItem.scheduledAt!).getTime();
    let flexIndex = 0;
    while (flexIndex < flexible.length) {
      const candidate = flexible[flexIndex];
      const end = cursor + durationMs(candidate);
      if (end > fixedStart) break;
      scheduled.push({ ...candidate, scheduleState: "flexible", plannedStartAt: new Date(cursor).toISOString(), plannedEndAt: new Date(end).toISOString() });
      cursor = end;
      flexible.splice(flexIndex, 1);
    }

    const fixedEnd = fixedStart + durationMs(fixedItem);
    scheduled.push({ ...fixedItem, scheduleState: "scheduled", plannedStartAt: new Date(fixedStart).toISOString(), plannedEndAt: new Date(fixedEnd).toISOString() });
    cursor = Math.max(cursor, fixedEnd);
  }

  for (const item of flexible) {
    const start = cursor;
    const end = start + durationMs(item);
    scheduled.push({ ...item, scheduleState: "flexible", plannedStartAt: new Date(start).toISOString(), plannedEndAt: new Date(end).toISOString() });
    cursor = end;
  }

  return [...scheduled, ...inactive];
}

export async function presentTodayPlan(model: TodayPlanReadyModel, userId: string): Promise<TodayPlanReadyModel> {
  const profile = await getProfileForUser(userId);
  if (!profile?.ca_level || !profile.group_choice || !profile.attempt_key) return model;

  const catalog = await getAcademicCatalog({
    level: profile.ca_level,
    group: profile.group_choice,
    attempt: profile.attempt_key,
  });

  const chapterMap = new Map<string, AcademicChapter>();
  for (const subject of catalog.subjects) {
    for (const chapter of subject.chapters) chapterMap.set(chapter.id, chapter);
  }

  const taskIds = model.items
    .filter((item) => item.sourceType === "task" && item.sourceId)
    .map((item) => item.sourceId!)
    .filter((id, index, all) => all.indexOf(id) === index);

  const taskMap = new Map<string, TaskRow>();
  if (taskIds.length) {
    const admin = createAdminSupabaseClient();
    const result = await admin.from("tasks").select("*").eq("user_id", userId).in("id", taskIds);
    if (!result.error) {
      for (const row of (result.data ?? []) as TaskRow[]) taskMap.set(row.id, row);
    }
  }

  const enriched = model.items.map((item) => {
    const sourceTask = item.sourceType === "task" && item.sourceId ? taskMap.get(item.sourceId) : undefined;
    const scheduledAt = sourceTask?.due_at ?? item.scheduledAt;
    return {
      ...item,
      scheduledAt,
      chapterDisplayTitle: item.chapterId ? chapterDisplay(chapterMap.get(item.chapterId)) : null,
    };
  });

  const items = scheduleItems(enriched);
  return {
    ...model,
    items,
    plannedMinutes: items.filter((item) => item.status === "planned").reduce((sum, item) => sum + item.estimatedMinutes, 0),
  };
}
