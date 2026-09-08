"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminOperator } from "@/lib/authorization/server";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { enqueueBackgroundJob, jobKey } from "@/lib/jobs/queue";
import {
  markIcaiScheduleDispatched,
  selectIcaiManualDispatch,
  type IcaiManualSyncMode,
} from "@/lib/icai/scheduler";

const MODES = new Set<IcaiManualSyncMode>([
  "due",
  "source",
  "group",
  "failed",
  "high-impact",
  "all",
]);

function text(value: FormDataEntryValue | null, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "ICAI scheduling action failed.";
}

function parseIstDateTime(value: string) {
  if (!value) throw new Error("Next due time is required.");
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    ? value
    : `${value.length === 16 ? `${value}:00` : value}+05:30`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid next due time.");
  return date.toISOString();
}

async function assertNoActiveSync() {
  const db = getD1RuntimeDatabase();
  const [run, job] = await Promise.all([
    db
      .prepare(
        "SELECT id FROM icai_sync_runs WHERE status IN ('queued','running') LIMIT 1",
      )
      .first<{ id: string }>(),
    db
      .prepare(
        "SELECT id FROM background_jobs WHERE job_type='icai-sync' AND status IN ('queued','running') LIMIT 1",
      )
      .first<{ id: string }>(),
  ]);
  if (run || job) throw new Error("An ICAI synchronization is already queued or running.");
}

async function auditScheduleControl(input: {
  sourceId?: string | null;
  action: string;
  reason?: string | null;
  actorUserId: string;
}) {
  await getD1RuntimeDatabase()
    .prepare(
      "INSERT INTO icai_sync_control_audit(id,run_id,source_id,item_id,action,reason,actor_user_id,created_at) VALUES(?1,NULL,?2,NULL,?3,?4,?5,CURRENT_TIMESTAMP)",
    )
    .bind(
      crypto.randomUUID(),
      input.sourceId ?? null,
      input.action,
      input.reason?.slice(0, 2_000) ?? null,
      input.actorUserId,
    )
    .run();
}

export async function runIcaiScheduleSelectionAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminOperator();
    const modeValue = text(formData.get("mode"), 40) as IcaiManualSyncMode;
    if (!MODES.has(modeValue)) throw new Error("Invalid ICAI scheduling mode.");
    const value = text(formData.get("value"), 200) || null;
    if ((modeValue === "source" || modeValue === "group") && !value) {
      throw new Error("A source or group selection is required.");
    }
    if (
      (modeValue === "high-impact" || modeValue === "all") &&
      text(formData.get("confirmation"), 20) !== "CONFIRM"
    ) {
      throw new Error("Confirm the high-impact/broad manual run before queueing it.");
    }

    await assertNoActiveSync();
    const db = getD1RuntimeDatabase();
    const selection = await selectIcaiManualDispatch(db, {
      mode: modeValue,
      value,
    });
    if (!selection.sourceIds.length) {
      throw new Error("No eligible ICAI sources matched this scheduling request.");
    }

    const now = new Date().toISOString();
    const job = await enqueueBackgroundJob({
      type: "icai-sync",
      idempotencyKey: jobKey(
        "icai-sync",
        `manual-${modeValue}-${value ?? "selection"}`,
        now,
      ),
      payload: {
        trigger: "manual",
        requestedBy: operator.user.id,
        sourceIds: selection.sourceIds,
        retryRunId: selection.retryRunId,
        retryMode: selection.retryMode,
        syncGroup: modeValue === "group" ? value : modeValue,
        scheduleWindow: `manual:${modeValue}`,
      },
      createdBy: operator.user.id,
    });
    await markIcaiScheduleDispatched(db, selection.sourceIds, now);
    for (const sourceId of selection.sourceIds) {
      await auditScheduleControl({
        sourceId,
        action: `manual_schedule_${modeValue}`,
        reason: `Queued job ${job.id}`,
        actorUserId: operator.user.id,
      });
    }
    revalidatePath("/admin/icai-sync");
    destination = `/admin/icai-sync?notice=${encodeURIComponent(`ICAI ${modeValue} selection queued (${job.id}) for ${selection.sourceIds.length} source${selection.sourceIds.length === 1 ? "" : "s"}.`)}`;
  } catch (error) {
    destination = `/admin/icai-sync?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(destination);
}

export async function updateIcaiSourceScheduleAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminOperator();
    const db = getD1RuntimeDatabase();
    const action = text(formData.get("action"), 40);
    const sourceId = text(formData.get("sourceId"), 200);
    if (!sourceId) throw new Error("ICAI source is required.");

    if (action === "update") {
      const syncGroup = text(formData.get("syncGroup"), 80);
      const intervalMinutes = Number(formData.get("intervalMinutes"));
      const priority = Number(formData.get("priority"));
      const nextDueAt = parseIstDateTime(text(formData.get("nextDueAt"), 80));
      if (!syncGroup) throw new Error("Sync group is required.");
      if (!Number.isInteger(intervalMinutes) || intervalMinutes < 360 || intervalMinutes > 10080) {
        throw new Error("Interval must be between 360 and 10080 minutes.");
      }
      if (!Number.isInteger(priority) || priority < 1 || priority > 100) {
        throw new Error("Priority must be between 1 and 100.");
      }
      const window = await db
        .prepare(
          "SELECT window_key FROM icai_sync_schedule_windows WHERE window_key=?1 AND enabled=1 AND window_kind='source' LIMIT 1",
        )
        .bind(syncGroup)
        .first<{ window_key: string }>();
      if (!window) throw new Error("Selected ICAI sync group is unavailable.");
      await db
        .prepare(
          "UPDATE icai_source_schedule SET sync_group=?1,interval_minutes=?2,priority=?3,next_due_at=?4,updated_at=CURRENT_TIMESTAMP WHERE source_id=?5",
        )
        .bind(syncGroup, intervalMinutes, priority, nextDueAt, sourceId)
        .run();
      await auditScheduleControl({
        sourceId,
        action: "update_source_schedule",
        reason: `${syncGroup}; interval=${intervalMinutes}; priority=${priority}; next_due_at=${nextDueAt}`,
        actorUserId: operator.user.id,
      });
      destination = "/admin/icai-sync?notice=ICAI%20source%20schedule%20updated.";
    } else if (action === "due_now") {
      await db
        .prepare(
          "UPDATE icai_source_schedule SET next_due_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE source_id=?1",
        )
        .bind(sourceId)
        .run();
      await auditScheduleControl({
        sourceId,
        action: "reschedule_source_now",
        actorUserId: operator.user.id,
      });
      destination = "/admin/icai-sync?notice=ICAI%20source%20marked%20due%20now.";
    } else if (action === "pause") {
      const hours = Number(formData.get("hours"));
      const reason = text(formData.get("reason"), 500);
      if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
        throw new Error("Pause duration must be between 1 and 168 hours.");
      }
      if (!reason) throw new Error("Pause reason is required.");
      const pausedUntil = new Date(Date.now() + hours * 60 * 60_000).toISOString();
      await db
        .prepare(
          `INSERT INTO icai_source_controls(source_id,paused_until,pause_reason,updated_by,updated_at)
           VALUES(?1,?2,?3,?4,CURRENT_TIMESTAMP)
           ON CONFLICT(source_id) DO UPDATE SET paused_until=excluded.paused_until,pause_reason=excluded.pause_reason,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
        )
        .bind(sourceId, pausedUntil, reason, operator.user.id)
        .run();
      await auditScheduleControl({
        sourceId,
        action: "pause_scheduled_source",
        reason,
        actorUserId: operator.user.id,
      });
      destination = `/admin/icai-sync?notice=${encodeURIComponent(`ICAI source paused until ${pausedUntil}.`)}`;
    } else if (action === "resume") {
      await db
        .prepare(
          "UPDATE icai_source_controls SET paused_until=NULL,pause_reason=NULL,updated_by=?1,updated_at=CURRENT_TIMESTAMP WHERE source_id=?2",
        )
        .bind(operator.user.id, sourceId)
        .run();
      await auditScheduleControl({
        sourceId,
        action: "resume_scheduled_source",
        actorUserId: operator.user.id,
      });
      destination = "/admin/icai-sync?notice=ICAI%20source%20resumed.";
    } else {
      throw new Error("Invalid ICAI source scheduling action.");
    }
    revalidatePath("/admin/icai-sync");
  } catch (error) {
    destination = `/admin/icai-sync?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(destination);
}
