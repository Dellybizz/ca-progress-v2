import "server-only";

import { optionalUser } from "@/lib/auth/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getTodayPlanPageModel, performTodayPlanAction } from "./service";
import type { TodayPlanAction } from "./types";

type PlanItemRow = Database["public"]["Tables"]["daily_plan_items"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type RevisionRow = Database["public"]["Tables"]["revision_due_items"]["Row"];
type ProgressRow = Database["public"]["Tables"]["chapter_progress"]["Row"];
type PlannerEventRow = Database["public"]["Tables"]["planner_events"]["Row"];

type ItemSnapshot = {
  id: string;
  planId: string;
  status: string;
  completedAt: string | null;
  scheduledAt: string | null;
  scheduledFor: string;
  manualOverride: boolean;
  manualNote: string | null;
  position: number;
  sourceType: string;
  sourceId: string | null;
  sourceKey: string;
  chapterId: string | null;
};

type ChangeSnapshot = {
  item?: ItemSnapshot;
  task?: { id: string; status: string; completedAt: string | null; dueAt: string };
  revision?: { id: string; status: string; completedAt: string | null; manualDueAt: string | null };
  progress?: {
    chapterId: string;
    completedAt: string | null;
    revision1At: string | null;
    revision2At: string | null;
    test1At: string | null;
    test2At: string | null;
  };
  reorder?: { id: string; position: number; manualOverride: boolean; manualNote: string | null }[];
  targetItemId?: string | null;
};

function itemSnapshot(item: PlanItemRow): ItemSnapshot {
  return {
    id: item.id,
    planId: item.plan_id,
    status: item.status,
    completedAt: item.completed_at,
    scheduledAt: item.scheduled_at,
    scheduledFor: item.scheduled_for,
    manualOverride: item.manual_override,
    manualNote: item.manual_note,
    position: item.position,
    sourceType: item.source_type,
    sourceId: item.source_id,
    sourceKey: item.source_key,
    chapterId: item.chapter_id,
  };
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function parsePayload(payload: Json): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
}

function preserveTimeOnDate(value: string, date: string) {
  const original = new Date(value);
  const replacement = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(original.getTime()) || !Number.isFinite(replacement.getTime())) return `${date}T12:00:00.000Z`;
  replacement.setUTCHours(original.getUTCHours(), original.getUTCMinutes(), original.getUTCSeconds(), 0);
  return replacement.toISOString();
}

async function ownedItem(userId: string, itemId: string) {
  const admin = createAdminSupabaseClient();
  const result = await admin.from("daily_plan_items").select("*").eq("id", itemId).eq("user_id", userId).maybeSingle();
  if (result.error || !result.data) throw new Error("Plan item was not found.");
  return result.data as PlanItemRow;
}

async function captureSnapshot(userId: string, item: PlanItemRow): Promise<ChangeSnapshot> {
  const admin = createAdminSupabaseClient();
  const snapshot: ChangeSnapshot = { item: itemSnapshot(item) };

  if (item.source_type === "task" && item.source_id) {
    const task = await admin.from("tasks").select("*").eq("id", item.source_id).eq("user_id", userId).maybeSingle();
    if (task.data) {
      const row = task.data as TaskRow;
      snapshot.task = { id: row.id, status: row.status, completedAt: row.completed_at, dueAt: row.due_at };
    }
  }

  if (item.source_type === "revision_due" && item.source_id) {
    const revision = await admin.from("revision_due_items").select("*").eq("id", item.source_id).eq("user_id", userId).maybeSingle();
    if (revision.data) {
      const row = revision.data as RevisionRow;
      snapshot.revision = { id: row.id, status: row.status, completedAt: row.completed_at, manualDueAt: row.manual_due_at };
    }
  }

  if (item.chapter_id) {
    const progress = await admin.from("chapter_progress").select("*").eq("chapter_id", item.chapter_id).eq("user_id", userId).maybeSingle();
    if (progress.data) {
      const row = progress.data as ProgressRow;
      snapshot.progress = {
        chapterId: row.chapter_id,
        completedAt: row.completed_at,
        revision1At: row.revision_1_at,
        revision2At: row.revision_2_at,
        test1At: row.test_1_at,
        test2At: row.test_2_at,
      };
    }
  }

  return snapshot;
}

async function recordChange(userId: string, itemId: string | null, action: string, snapshot: ChangeSnapshot) {
  const admin = createAdminSupabaseClient();
  const inserted = await admin.from("planner_events").insert({
    user_id: userId,
    event_type: "today_plan_change",
    entity_type: "daily_plan_item",
    entity_id: itemId,
    payload: toJson({ action, snapshot }),
  });
  if (inserted.error) throw new Error("Today Plan history could not be recorded.");
}

async function latestUndoableEvent(userId: string) {
  const admin = createAdminSupabaseClient();
  const result = await admin
    .from("planner_events")
    .select("*")
    .eq("user_id", userId)
    .in("event_type", ["today_plan_change", "today_plan_undo"])
    .order("created_at", { ascending: false })
    .limit(40);
  if (result.error) throw new Error("Today Plan history could not be loaded.");

  const reverted = new Set<string>();
  for (const event of (result.data ?? []) as PlannerEventRow[]) {
    if (event.event_type !== "today_plan_undo") continue;
    const payload = parsePayload(event.payload);
    if (typeof payload.revertsEventId === "string") reverted.add(payload.revertsEventId);
  }

  return ((result.data ?? []) as PlannerEventRow[]).find((event) => event.event_type === "today_plan_change" && !reverted.has(event.id)) ?? null;
}

async function restoreSnapshot(userId: string, snapshot: ChangeSnapshot) {
  const admin = createAdminSupabaseClient();

  if (snapshot.targetItemId) {
    await admin.from("daily_plan_items").delete().eq("id", snapshot.targetItemId).eq("user_id", userId);
  }

  if (snapshot.item) {
    const item = snapshot.item;
    const restored = await admin.from("daily_plan_items").update({
      status: item.status,
      completed_at: item.completedAt,
      scheduled_at: item.scheduledAt,
      scheduled_for: item.scheduledFor,
      manual_override: item.manualOverride,
      manual_note: item.manualNote,
      position: item.position,
    }).eq("id", item.id).eq("user_id", userId);
    if (restored.error) throw new Error("The previous plan item state could not be restored.");
  }

  if (snapshot.task) {
    const task = snapshot.task;
    const restored = await admin.from("tasks").update({ status: task.status, completed_at: task.completedAt, due_at: task.dueAt }).eq("id", task.id).eq("user_id", userId);
    if (restored.error) throw new Error("The previous task state could not be restored.");
  }

  if (snapshot.revision) {
    const revision = snapshot.revision;
    const restored = await admin.from("revision_due_items").update({ status: revision.status, completed_at: revision.completedAt, manual_due_at: revision.manualDueAt }).eq("id", revision.id).eq("user_id", userId);
    if (restored.error) throw new Error("The previous revision state could not be restored.");
  }

  if (snapshot.progress) {
    const progress = snapshot.progress;
    const restored = await admin.from("chapter_progress").update({
      completed_at: progress.completedAt,
      revision_1_at: progress.revision1At,
      revision_2_at: progress.revision2At,
      test_1_at: progress.test1At,
      test_2_at: progress.test2At,
    }).eq("chapter_id", progress.chapterId).eq("user_id", userId);
    if (restored.error) throw new Error("The previous progress state could not be restored.");
  }

  if (snapshot.reorder?.length) {
    for (const entry of snapshot.reorder) {
      const restored = await admin.from("daily_plan_items").update({
        position: entry.position,
        manual_override: entry.manualOverride,
        manual_note: entry.manualNote,
      }).eq("id", entry.id).eq("user_id", userId);
      if (restored.error) throw new Error("The previous task order could not be restored.");
    }
  }
}

async function undoLatest(userId: string) {
  const event = await latestUndoableEvent(userId);
  if (!event) throw new Error("There is nothing to undo.");
  const payload = parsePayload(event.payload);
  const snapshot = payload.snapshot as ChangeSnapshot | undefined;
  if (!snapshot) throw new Error("This change cannot be undone safely.");

  await restoreSnapshot(userId, snapshot);
  const admin = createAdminSupabaseClient();
  const inserted = await admin.from("planner_events").insert({
    user_id: userId,
    event_type: "today_plan_undo",
    entity_type: "daily_plan_item",
    entity_id: event.entity_id,
    payload: toJson({ revertsEventId: event.id }),
  });
  if (inserted.error) throw new Error("Undo history could not be recorded.");
  await getTodayPlanPageModel({ force: true });
  return { ok: true };
}

async function startItem(userId: string, itemId: string) {
  const item = await ownedItem(userId, itemId);
  if (item.status !== "planned") throw new Error("Only a planned item can be started.");
  const admin = createAdminSupabaseClient();
  const previous = await admin.from("planner_events").select("id").eq("user_id", userId).eq("event_type", "today_plan_started").eq("entity_id", itemId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previous.data) return { ok: true };
  const startedAt = new Date().toISOString();
  const inserted = await admin.from("planner_events").insert({
    user_id: userId,
    event_type: "today_plan_started",
    entity_type: "daily_plan_item",
    entity_id: itemId,
    payload: toJson({ startedAt }),
  });
  if (inserted.error) throw new Error("Task start time could not be saved.");
  return { ok: true, startedAt };
}

async function reorderItems(userId: string, itemIds: string[]) {
  const unique = [...new Set(itemIds)];
  if (!unique.length || unique.length !== itemIds.length) throw new Error("Choose a valid task order.");
  const admin = createAdminSupabaseClient();
  const result = await admin.from("daily_plan_items").select("*").eq("user_id", userId).in("id", unique);
  if (result.error || (result.data ?? []).length !== unique.length) throw new Error("One or more plan items could not be reordered.");
  const rows = result.data as PlanItemRow[];
  if (rows.some((row) => row.status !== "planned")) throw new Error("Only active plan items can be reordered.");
  const planIds = new Set(rows.map((row) => row.plan_id));
  if (planIds.size !== 1) throw new Error("Tasks from different plans cannot be reordered together.");

  const snapshot: ChangeSnapshot = {
    reorder: rows.map((row) => ({ id: row.id, position: row.position, manualOverride: row.manual_override, manualNote: row.manual_note })),
  };

  for (const [position, id] of unique.entries()) {
    const updated = await admin.from("daily_plan_items").update({ position, manual_override: true, manual_note: "Order adjusted by student" }).eq("id", id).eq("user_id", userId);
    if (updated.error) throw new Error("Task order could not be saved.");
  }
  await recordChange(userId, null, "reorder", snapshot);
  return { ok: true };
}

export async function performTodayPlanInteraction(action: TodayPlanAction) {
  const identity = await optionalUser();
  if (!identity) throw new Error("Sign in to update your plan.");
  const userId = identity.id;

  if (action.action === "refresh") return performTodayPlanAction(action);
  if (action.action === "undo") return undoLatest(userId);
  if (action.action === "start") return startItem(userId, action.itemId);
  if (action.action === "reorder") return reorderItems(userId, action.itemIds);

  const item = await ownedItem(userId, action.itemId);
  const snapshot = await captureSnapshot(userId, item);
  await performTodayPlanAction(action);

  const admin = createAdminSupabaseClient();

  if (action.action === "snooze" && item.source_type === "task" && item.source_id) {
    const dueAt = new Date(Date.now() + Math.max(15, Math.min(1440, Math.round(action.minutes))) * 60_000).toISOString();
    const updated = await admin.from("tasks").update({ due_at: dueAt }).eq("id", item.source_id).eq("user_id", userId);
    if (updated.error) throw new Error("The source task could not be snoozed.");
  }

  if (action.action === "reschedule" && item.source_type === "task" && item.source_id && snapshot.task) {
    const dueAt = preserveTimeOnDate(snapshot.task.dueAt, action.date);
    const updated = await admin.from("tasks").update({ due_at: dueAt }).eq("id", item.source_id).eq("user_id", userId);
    if (updated.error) throw new Error("The source task could not be rescheduled.");
  }

  if (action.action === "reschedule") {
    const target = await admin.from("daily_plan_items").select("id").eq("user_id", userId).eq("source_key", item.source_key).eq("scheduled_for", action.date).neq("id", item.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    snapshot.targetItemId = target.data?.id ?? null;
  }

  await recordChange(userId, item.id, action.action, snapshot);

  if (action.action === "skip" || action.action === "reschedule" || action.action === "complete") {
    await getTodayPlanPageModel({ force: true });
  }

  return { ok: true };
}

export async function getTodayPlanUndoState(userId: string) {
  return Boolean(await latestUndoableEvent(userId));
}

export async function getTodayPlanStartedTimes(userId: string, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, string>();
  const admin = createAdminSupabaseClient();
  const result = await admin
    .from("planner_events")
    .select("*")
    .eq("user_id", userId)
    .eq("event_type", "today_plan_started")
    .in("entity_id", itemIds)
    .order("created_at", { ascending: false })
    .limit(Math.max(50, itemIds.length * 3));
  const map = new Map<string, string>();
  if (result.error) return map;
  for (const event of (result.data ?? []) as PlannerEventRow[]) {
    if (!event.entity_id || map.has(event.entity_id)) continue;
    const payload = parsePayload(event.payload);
    if (typeof payload.startedAt === "string") map.set(event.entity_id, payload.startedAt);
  }
  return map;
}
