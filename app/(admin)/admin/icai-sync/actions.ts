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
