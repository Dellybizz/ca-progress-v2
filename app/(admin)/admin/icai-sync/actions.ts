"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminOperator } from "@/lib/authorization/server";
import {
  createD1AdminClient,
  getD1RuntimeDatabase,
} from "@/lib/data/d1/client";
import { invalidateSharedPublicCache } from "@/lib/cache/public";
import { enqueueBackgroundJob, jobKey } from "@/lib/jobs/queue";
import {
  decideIcaiReview,
  normalizeIcaiReviewDecision,
} from "@/lib/icai/review";

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown background job error.";
}

function cleanText(value: FormDataEntryValue | null, max: number) {
  const next = String(value ?? "").trim();
  return next ? next.slice(0, max) : "";
}

async function auditControl(input: {
  runId?: string | null;
  sourceId?: string | null;
  itemId?: string | null;
  action: string;
  reason?: string | null;
  actorUserId: string;
}) {
  const db = getD1RuntimeDatabase();
  await db
    .prepare(
      "INSERT INTO icai_sync_control_audit(id,run_id,source_id,item_id,action,reason,actor_user_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,CURRENT_TIMESTAMP)",
    )
    .bind(
      crypto.randomUUID(),
      input.runId ?? null,
      input.sourceId ?? null,
      input.itemId ?? null,
      input.action,
      input.reason?.slice(0, 2_000) ?? null,
      input.actorUserId,
    )
    .run();
}

async function assertNoActiveIcaiSync() {
  const admin = createD1AdminClient();
  const [activeRun, activeJob] = await Promise.all([
    admin
      .from("icai_sync_runs")
      .select("id")
      .eq("status", "running")
      .limit(1)
      .maybeSingle(),
    admin
      .from("background_jobs")
      .select("id")
      .eq("job_type", "icai-sync")
      .in("status", ["queued", "running"])
      .limit(1)
      .maybeSingle(),
  ]);
  if (activeRun.error) throw activeRun.error;
  if (activeJob.error) throw activeJob.error;
  if (activeRun.data || activeJob.data)
    throw new Error("An ICAI synchronization is already queued or running.");
}

export async function runIcaiSyncAction() {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminOperator();
    await assertNoActiveIcaiSync();
    const now = new Date().toISOString();
    const job = await enqueueBackgroundJob({
      type: "icai-sync",
      idempotencyKey: jobKey("icai-sync", "manual", now.slice(0, 16)),
      payload: { trigger: "manual", requestedBy: operator.user.id },
      createdBy: operator.user.id,
    });
    revalidatePath("/admin/icai-sync");
    destination = `/admin/icai-sync?notice=${encodeURIComponent(`Sync queued (${job.id}). Results will appear when the worker finishes.`)}`;
  } catch (error) {
    destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`;
  }
  redirect(destination);
}

export async function controlIcaiSyncAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminOperator();
    const runId = cleanText(formData.get("runId"), 200);
    const intent = cleanText(formData.get("intent"), 40);
    if (
      !runId ||
      ![
        "cancel",
        "skip",
        "skip_item",
        "skip_remaining",
        "recover",
      ].includes(intent)
    )
      throw new Error("Invalid synchronization control request.");

    const admin = createD1AdminClient();
    const current = await admin
      .from("icai_sync_runtime")
      .select("*")
      .eq("run_id", runId)
      .maybeSingle();
    if (current.error) throw current.error;
    if (!current.data)
      throw new Error("The active sync runtime was not found.");

    if (intent === "recover") {
      const heartbeat = new Date(current.data.heartbeat_at).getTime();
      if (Date.now() - heartbeat < 2 * 60_000)
        throw new Error(
          "This run still has a recent heartbeat and is not stale.",
        );
      const now = new Date().toISOString();
      const runUpdate = await admin
        .from("icai_sync_runs")
        .update({
          status: "failed",
          completed_at: now,
          error_summary:
            "Run recovered by an administrator after its heartbeat stopped.",
        })
        .eq("id", runId);
      if (runUpdate.error) throw runUpdate.error;
      const jobUpdate = await admin
        .from("background_jobs")
        .update({
          status: "failed",
          finished_at: now,
          last_error: "Recovered after the ICAI sync heartbeat stopped.",
          updated_at: now,
        })
        .eq("job_type", "icai-sync")
        .in("status", ["queued", "running"]);
      if (jobUpdate.error) throw jobUpdate.error;
      const runtimeUpdate = await admin
        .from("icai_sync_runtime")
        .update({
          stage: "failed",
          control_requested_by: operator.user.id,
          control_reason: "stale_recovery",
          updated_at: now,
        })
        .eq("run_id", runId);
      if (runtimeUpdate.error) throw runtimeUpdate.error;
      await getD1RuntimeDatabase()
        .prepare(
          "UPDATE icai_sync_items SET status='failed',stage='stale_recovery',completed_at=?1,failure_category='stale_recovery',failure_message=COALESCE(failure_message,'Run recovered after heartbeat stopped.'),retry_eligible=1,updated_at=?1 WHERE run_id=?2 AND status='running'",
        )
        .bind(now, runId)
        .run();
      await auditControl({
        runId,
        action: "recover_stale_run",
        reason: "stale_recovery",
        actorUserId: operator.user.id,
      });
      destination = "/admin/icai-sync?notice=Stale%20run%20recovered.";
    } else if (intent === "skip_item" || intent === "skip_remaining") {
      if (!current.data.current_source_id || !current.data.current_item_url)
        throw new Error("No current ICAI item is available to skip.");
      const db = getD1RuntimeDatabase();
      const skipItem = intent === "skip_item" ? 1 : 0;
      const skipRemaining = intent === "skip_remaining" ? 1 : 0;
      await db
        .prepare(
          `INSERT INTO icai_sync_item_controls(run_id,skip_item_requested,skip_remaining_requested,requested_by,reason,updated_at)
           VALUES(?1,?2,?3,?4,?5,CURRENT_TIMESTAMP)
           ON CONFLICT(run_id) DO UPDATE SET
             skip_item_requested=excluded.skip_item_requested,
             skip_remaining_requested=excluded.skip_remaining_requested,
             requested_by=excluded.requested_by,
             reason=excluded.reason,
             updated_at=CURRENT_TIMESTAMP`,
        )
        .bind(
          runId,
          skipItem,
          skipRemaining,
          operator.user.id,
          intent === "skip_item" ? "admin_skip_item" : "admin_skip_remaining",
        )
        .run();
      const item = await db
        .prepare(
          "SELECT id FROM icai_sync_items WHERE run_id=?1 AND source_id=?2 AND item_url=?3 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(
          runId,
          current.data.current_source_id,
          current.data.current_item_url,
        )
        .first<{ id: string }>();
      await auditControl({
        runId,
        sourceId: current.data.current_source_id,
        itemId: item?.id ?? null,
        action: intent,
        reason: cleanText(formData.get("reason"), 500) || null,
        actorUserId: operator.user.id,
      });
      destination = `/admin/icai-sync?notice=${encodeURIComponent(
        intent === "skip_item"
          ? "Current item skip requested. The worker will continue with the next item at its safe checkpoint."
          : "Remaining items for this source will be skipped at the next safe checkpoint.",
      )}`;
    } else {
      const update = await admin
        .from("icai_sync_runtime")
        .update({
          ...(intent === "cancel"
            ? { cancel_requested: true }
            : { skip_source_requested: true }),
          control_requested_by: operator.user.id,
          control_reason:
            intent === "cancel" ? "admin_cancel" : "admin_skip_source",
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", runId);
      if (update.error) throw update.error;
      await auditControl({
        runId,
        sourceId: current.data.current_source_id,
        action: intent === "cancel" ? "cancel_run" : "skip_source",
        actorUserId: operator.user.id,
      });
      destination = `/admin/icai-sync?notice=${encodeURIComponent(
        intent === "cancel"
          ? "Cancellation requested. The worker will stop at its next checkpoint."
          : "Skip requested. The worker will preserve existing data and continue with the next source.",
      )}`;
    }
    revalidatePath("/admin/icai-sync");
  } catch (error) {
    destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`;
  }
  redirect(destination);
}

export async function retryIcaiItemsAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminOperator();
    const originRunId = cleanText(formData.get("runId"), 200);
    const mode = cleanText(formData.get("mode"), 40);
    const itemId = cleanText(formData.get("itemId"), 200) || null;
    if (!originRunId || !["failed", "timed_out", "item"].includes(mode))
      throw new Error("Invalid ICAI item retry request.");
    if (mode === "item" && !itemId)
      throw new Error("A specific ICAI item is required for item retry.");
    await assertNoActiveIcaiSync();

    const db = getD1RuntimeDatabase();
    let query =
      "SELECT COUNT(*) AS count FROM icai_sync_items WHERE run_id=?1 AND retry_eligible=1";
    const values: unknown[] = [originRunId];
    if (mode === "timed_out") query += " AND status='timed_out'";
    else query += " AND status IN ('failed','timed_out','skipped')";
    if (mode === "item") {
      values.push(itemId);
      query += ` AND id=?${values.length}`;
    }
    const eligible = await db
      .prepare(query)
      .bind(...values)
      .first<{ count: number }>();
    if (!eligible || Number(eligible.count) < 1)
      throw new Error("No retry-eligible ICAI items matched this request.");

    const now = new Date().toISOString();
    const job = await enqueueBackgroundJob({
      type: "icai-sync",
      idempotencyKey: jobKey(
        "icai-sync",
        `retry-${mode}-${originRunId}-${itemId ?? "all"}`,
        now,
      ),
      payload: {
        trigger: "manual",
        requestedBy: operator.user.id,
        retryRunId: originRunId,
        retryMode: mode,
        retryItemId: itemId,
      },
      createdBy: operator.user.id,
    });
    await auditControl({
      runId: originRunId,
      itemId,
      action: `retry_${mode}`,
      reason: `Queued targeted retry job ${job.id}`,
      actorUserId: operator.user.id,
    });
    revalidatePath("/admin/icai-sync");
    destination = `/admin/icai-sync?notice=${encodeURIComponent(`Targeted ICAI retry queued (${job.id}). Successful items from the original run will not be rerun.`)}`;
  } catch (error) {
    destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`;
  }
  redirect(destination);
}

export async function manageIcaiItemAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminOperator();
    const db = getD1RuntimeDatabase();
    const action = cleanText(formData.get("action"), 40);
    const runId = cleanText(formData.get("runId"), 200) || null;
    const itemId = cleanText(formData.get("itemId"), 200) || null;
    const sourceId = cleanText(formData.get("sourceId"), 200) || null;
    const reason = cleanText(formData.get("reason"), 2_000);

    if (action === "note") {
      if (!itemId || !reason) throw new Error("Item and administrative note are required.");
      await db
        .prepare(
          "UPDATE icai_sync_items SET admin_note=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2",
        )
        .bind(reason, itemId)
        .run();
      await auditControl({
        runId,
        sourceId,
        itemId,
        action: "item_note",
        reason,
        actorUserId: operator.user.id,
      });
      destination = "/admin/icai-sync?notice=Administrative%20note%20saved.";
    } else if (
      action === "exclude_run" ||
      action === "exclude_temp" ||
      action === "exclude_permanent"
    ) {
      if (!itemId || !sourceId || !reason)
        throw new Error("Item, source and exclusion reason are required.");
      if (cleanText(formData.get("confirmation"), 40) !== "IGNORE")
        throw new Error("Type IGNORE to confirm URL exclusion.");
      const item = await db
        .prepare(
          "SELECT item_url FROM icai_sync_items WHERE id=?1 AND source_id=?2 LIMIT 1",
        )
        .bind(itemId, sourceId)
        .first<{ item_url: string }>();
      if (!item) throw new Error("ICAI item was not found.");
      const source = await db
        .prepare(
          "SELECT trust_level,resource_types FROM icai_sources WHERE id=?1 LIMIT 1",
        )
        .bind(sourceId)
        .first<{ trust_level: string; resource_types: string }>();
      if (!source) throw new Error("ICAI source was not found.");

      const scope =
        action === "exclude_run"
          ? "run"
          : action === "exclude_temp"
            ? "temporary"
            : "permanent";
      if (scope === "run" && !runId)
        throw new Error("Run-scoped URL exclusion requires a run id.");
      const highImpact =
        source.trust_level === "high_impact" ||
        /schedule|exam/i.test(String(source.resource_types ?? ""));
      if (scope === "permanent") {
        if (cleanText(formData.get("permanentConfirmation"), 40) !== "PERMANENT")
          throw new Error("Type PERMANENT to confirm a permanent ICAI URL exclusion.");
        if (
          highImpact &&
          !["owner", "parent_owner"].includes(operator.role)
        )
          throw new Error(
            "Permanent exclusion of an exam/high-impact source requires owner-level authority.",
          );
        if (
          highImpact &&
          cleanText(formData.get("ownerConfirmation"), 40) !== "OWNER"
        )
          throw new Error(
            "Type OWNER to confirm permanent exclusion of a high-impact ICAI URL.",
          );
      }

      const hours = Math.max(
        1,
        Math.min(168, Number(formData.get("hours") ?? 24) || 24),
      );
      const expiresAt =
        scope === "temporary"
          ? new Date(Date.now() + hours * 60 * 60_000).toISOString()
          : null;
      await db
        .prepare(
          "INSERT INTO icai_sync_item_exclusions(id,source_id,run_id,item_url,scope,reason,expires_at,created_by,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,CURRENT_TIMESTAMP)",
        )
        .bind(
          crypto.randomUUID(),
          sourceId,
          scope === "run" ? runId : null,
          item.item_url,
          scope,
          reason,
          expiresAt,
          operator.user.id,
        )
        .run();
      await auditControl({
        runId,
        sourceId,
        itemId,
        action: `${scope}_url_exclusion`,
        reason,
        actorUserId: operator.user.id,
      });
      destination = `/admin/icai-sync?notice=${encodeURIComponent(`${scope} URL exclusion saved. Existing verified content was not deleted.`)}`;
    } else if (action === "revoke_exclusion") {
      const exclusionId = cleanText(formData.get("exclusionId"), 200);
      if (!exclusionId) throw new Error("Exclusion id is required.");
      await db
        .prepare(
          "UPDATE icai_sync_item_exclusions SET revoked_at=CURRENT_TIMESTAMP,revoked_by=?1 WHERE id=?2 AND revoked_at IS NULL",
        )
        .bind(operator.user.id, exclusionId)
        .run();
      await auditControl({
        runId,
        sourceId,
        itemId,
        action: "revoke_url_exclusion",
        reason: exclusionId,
        actorUserId: operator.user.id,
      });
      destination = "/admin/icai-sync?notice=URL%20exclusion%20revoked.";
    } else if (action === "pause_source") {
      if (!sourceId || !reason) throw new Error("Source and pause reason are required.");
      const hours = Math.max(
        1,
        Math.min(168, Number(formData.get("hours") ?? 24) || 24),
      );
      const pausedUntil = new Date(Date.now() + hours * 60 * 60_000).toISOString();
      await db
        .prepare(
          `INSERT INTO icai_source_controls(source_id,paused_until,pause_reason,updated_by,updated_at)
           VALUES(?1,?2,?3,?4,CURRENT_TIMESTAMP)
           ON CONFLICT(source_id) DO UPDATE SET paused_until=excluded.paused_until,pause_reason=excluded.pause_reason,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
        )
        .bind(sourceId, pausedUntil, reason, operator.user.id)
        .run();
      await auditControl({
        runId,
        sourceId,
        action: "pause_source",
        reason,
        actorUserId: operator.user.id,
      });
      destination = `/admin/icai-sync?notice=${encodeURIComponent(`Source paused until ${pausedUntil}.`)}`;
    } else if (action === "resume_source") {
      if (!sourceId) throw new Error("Source is required.");
      await db
        .prepare(
          "UPDATE icai_source_controls SET paused_until=NULL,pause_reason=NULL,updated_by=?1,updated_at=CURRENT_TIMESTAMP WHERE source_id=?2",
        )
        .bind(operator.user.id, sourceId)
        .run();
      await auditControl({
        runId,
        sourceId,
        action: "resume_source",
        actorUserId: operator.user.id,
      });
      destination = "/admin/icai-sync?notice=Source%20resumed.";
    } else {
      throw new Error("Invalid ICAI item management action.");
    }
    revalidatePath("/admin/icai-sync");
  } catch (error) {
    destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`;
  }
  redirect(destination);
}

export async function decideIcaiReviewAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminOperator();
    const reviewId = String(formData.get("reviewId") ?? "");
    const decision = normalizeIcaiReviewDecision(formData.get("decision"));
    if (!reviewId || !decision) throw new Error("Invalid review request.");

    const result = await decideIcaiReview({
      reviewId,
      decision,
      reviewerUserId: operator.user.id,
      notes: "",
    });
    await invalidateSharedPublicCache(["icai"]);

    revalidatePath("/admin/icai-sync");
    revalidatePath("/updates");
    revalidatePath("/resources/icai");
    destination = `/admin/icai-sync?notice=${encodeURIComponent(`Review ${result.status}. The approved patch and audit trail are now consistent.`)}`;
  } catch (error) {
    destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`;
  }
  redirect(destination);
}
