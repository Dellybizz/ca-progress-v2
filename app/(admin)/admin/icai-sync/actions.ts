"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminOperator } from "@/lib/authorization/server";
import { createD1AdminClient } from "@/lib/data/d1/client";
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

export async function runIcaiSyncAction() {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminOperator();
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
    const runId = String(formData.get("runId") ?? "");
    const intent = String(formData.get("intent") ?? "");
    if (!runId || !["cancel", "skip", "recover"].includes(intent))
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
      destination = "/admin/icai-sync?notice=Stale%20run%20recovered.";
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
