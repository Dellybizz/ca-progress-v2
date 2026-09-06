import "server-only";

import { optionalUser } from "@/lib/auth/server";
import { getTodayPlanDisplayModel, type TodayPlanDisplayItem, type TodayPlanDisplayModel } from "@/lib/smart-planner/today-display";
import type { TodayPlanPageModel } from "@/lib/smart-planner/types";
import { getTaskPlanningExtensions } from "./phase8";

function addMinutes(date: Date, minutes: number) { return new Date(date.getTime() + Math.max(1, minutes) * 60_000); }
function fixedTimeFor(item: TodayPlanDisplayItem) {
  if (!item.scheduledAt) return null;
  const scheduled = new Date(item.scheduledAt);
  return Number.isFinite(scheduled.getTime()) ? scheduled : null;
}

function organisePhase8Today(items: TodayPlanDisplayItem[]) {
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
    const start = new Date(cursor); const end = addMinutes(start, entry.item.estimatedMinutes);
    result.push({ ...entry.item, plannedStartAt: start.toISOString(), plannedEndAt: end.toISOString(), scheduleState: "overdue" }); cursor = end;
  }
  for (const anchor of futureFixed) {
    while (flexible.length) {
      const availableMinutes = Math.max(0, Math.floor((anchor.at.getTime() - cursor.getTime()) / 60_000));
      const fittingIndex = flexible.findIndex((item) => item.estimatedMinutes <= availableMinutes);
      if (fittingIndex < 0) break;
      const [next] = flexible.splice(fittingIndex, 1);
      const start = new Date(cursor); const end = addMinutes(start, next.estimatedMinutes);
      result.push({ ...next, plannedStartAt: start.toISOString(), plannedEndAt: end.toISOString(), scheduleState: "planned" }); cursor = end;
    }
    const end = addMinutes(anchor.at, anchor.item.estimatedMinutes);
    result.push({ ...anchor.item, plannedStartAt: anchor.at.toISOString(), plannedEndAt: end.toISOString(), scheduleState: "fixed" });
    if (end > cursor) cursor = end;
  }
  for (const item of flexible) {
    const start = new Date(cursor); const end = addMinutes(start, item.estimatedMinutes);
    result.push({ ...item, plannedStartAt: start.toISOString(), plannedEndAt: end.toISOString(), scheduleState: "planned" }); cursor = end;
  }
  return [...result, ...inactive.map((item) => ({ ...item, plannedStartAt: fixedTimeFor(item)?.toISOString() ?? null, plannedEndAt: null, scheduleState: null }))];
}

export async function getPhase8TodayModel(): Promise<TodayPlanPageModel | TodayPlanDisplayModel> {
  const base = await getTodayPlanDisplayModel();
  if (base.mode !== "ready" || !("evidenceMode" in base)) return base;
  const identity = await optionalUser();
  if (!identity) return base;
  const taskIds = base.items.filter((item) => item.sourceType === "task" && item.sourceId).map((item) => item.sourceId as string);
  const extensions = await getTaskPlanningExtensions(identity.id, taskIds);
  const items = base.items.map((item) => {
    if (item.sourceType !== "task" || !item.sourceId) return item;
    const extension = extensions.get(item.sourceId);
    if (extension?.schedule_mode !== "flexible") return item;
    return { ...item, scheduledAt: null, plannedStartAt: null, plannedEndAt: null, scheduleState: null };
  });
  return { ...base, items: organisePhase8Today(items) };
}
