"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { recordAdminAuditEvent } from "@/lib/admin/audit";
import { requireAdminCapability } from "@/lib/authorization/server";
import { createD1AdminClient } from "@/lib/data/d1/client";
import { invalidateSharedPublicCache } from "@/lib/cache/public";
import { enqueueBackgroundJob, jobKey } from "@/lib/jobs/queue";
import { decideIcaiReview, normalizeIcaiReviewDecision } from "@/lib/icai/review";
import { isApprovedIcaiUrl } from "@/lib/icai/html";

function message(error: unknown) { return error instanceof Error ? error.message : "Unknown background job error."; }
function traceId() { return crypto.randomUUID(); }

export async function runIcaiSyncAction() {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminCapability("icai.run");
    const admin = createD1AdminClient();
    const [activeRun, activeJob] = await Promise.all([
      admin.from("icai_sync_runs").select("id").eq("status", "running").limit(1).maybeSingle(),
      admin.from("background_jobs").select("id").eq("job_type", "icai-sync").in("status", ["queued", "running"]).limit(1).maybeSingle(),
    ]);
    if (activeRun.error) throw activeRun.error;
    if (activeJob.error) throw activeJob.error;
    if (activeRun.data || activeJob.data) throw new Error("An ICAI synchronization is already queued or running.");
    const now = new Date().toISOString();
    const job = await enqueueBackgroundJob({ type: "icai-sync", idempotencyKey: jobKey("icai-sync", "manual", now.slice(0, 16)), payload: { trigger: "manual", requestedBy: operator.user.id }, createdBy: operator.user.id });
    await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.run", action: "icai.sync.run", targetType: "background_job", targetId: job.id, reason: "Manual ICAI synchronization", newValue: { jobType: "icai-sync", trigger: "manual" }, traceId: traceId(), reversible: false });
    revalidatePath("/admin/icai-sync");
    destination = `/admin/icai-sync?notice=${encodeURIComponent(`Sync queued (${job.id}). Results will appear when the worker finishes.`)}`;
  } catch (error) { destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`; }
  redirect(destination);
}

export async function recoverIcaiStartupJobAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminCapability("icai.run");
    const jobId = String(formData.get("jobId") ?? "").trim().slice(0, 200);
    if (!jobId) throw new Error("The stalled synchronization job was not identified.");
    const admin = createD1AdminClient();
    const current = await admin.from("background_jobs").select("id,status,created_at,started_at").eq("id", jobId).eq("job_type", "icai-sync").maybeSingle();
    if (current.error) throw current.error;
    if (!current.data || !["queued", "running"].includes(current.data.status)) throw new Error("This synchronization job is no longer active.");
    const anchor = new Date(current.data.started_at ?? current.data.created_at).getTime();
    if (!Number.isFinite(anchor) || Date.now() - anchor < 2 * 60_000) throw new Error("This job is still within its startup window.");
    const now = new Date().toISOString();
    const update = await admin.from("background_jobs").update({ status: "failed", finished_at: now, last_error: "Orphaned ICAI job recovered before a sync run started.", updated_at: now }).eq("id", jobId).in("status", ["queued", "running"]);
    if (update.error) throw update.error;
    await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.run", action: "icai.sync.recover_startup", targetType: "background_job", targetId: jobId, reason: "No ICAI run or heartbeat appeared within two minutes", previousValue: { status: current.data.status }, newValue: { status: "failed" }, traceId: traceId(), reversible: false });
    revalidatePath("/admin/icai-sync");
    destination = "/admin/icai-sync?notice=Stalled%20startup%20job%20recovered.";
  } catch (error) { destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`; }
  redirect(destination);
}

export async function controlIcaiSyncAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminCapability("icai.run");
    const runId = String(formData.get("runId") ?? "");
    const intent = String(formData.get("intent") ?? "");
    if (!runId || !["pause", "resume", "cancel", "skip", "recover"].includes(intent)) throw new Error("Invalid synchronization control request.");
    const admin = createD1AdminClient();
    const current = await admin.from("icai_sync_runtime").select("*").eq("run_id", runId).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) throw new Error("The active sync runtime was not found.");
    if (intent === "recover") {
      if (formData.get("confirm") !== "clear") throw new Error("Confirm stale-lock recovery before continuing.");
      const heartbeat = new Date(current.data.heartbeat_at).getTime();
      if (Date.now() - heartbeat < 2 * 60_000) throw new Error("This run still has a recent heartbeat and is not stale.");
      const now = new Date().toISOString();
      const runUpdate = await admin.from("icai_sync_runs").update({ status: "failed", completed_at: now, error_summary: "Run recovered by an administrator after its heartbeat stopped." }).eq("id", runId);
      if (runUpdate.error) throw runUpdate.error;
      const jobUpdate = await admin.from("background_jobs").update({ status: "failed", finished_at: now, last_error: "Recovered after the ICAI sync heartbeat stopped.", updated_at: now }).eq("job_type", "icai-sync").in("status", ["queued", "running"]);
      if (jobUpdate.error) throw jobUpdate.error;
      const runtimeUpdate = await admin.from("icai_sync_runtime").update({ stage: "failed", control_requested_by: operator.user.id, control_reason: "stale_recovery", updated_at: now }).eq("run_id", runId);
      if (runtimeUpdate.error) throw runtimeUpdate.error;
      destination = "/admin/icai-sync?notice=Stale%20run%20recovered.";
    } else if (intent === "resume") {
      if (current.data.stage !== "paused") throw new Error("This synchronization is not paused.");
      const states = await admin.from("icai_sync_source_states").select("source_id,source_index,status,cursor_offset").eq("run_id", runId).in("status", ["pending", "running"]).order("source_index").limit(1);
      if (states.error) throw states.error;
      const next = states.data?.[0];
      const run = await admin.from("icai_sync_runs").select("details").eq("id", runId).maybeSingle();
      if (run.error) throw run.error;
      const details = JSON.parse(String(run.data?.details ?? "{}")) as {source_ids?:unknown[]};
      const sourceIds = Array.isArray(details.source_ids) ? details.source_ids.filter((value): value is string => typeof value === "string") : [];
      await enqueueBackgroundJob({ type: "icai-sync", idempotencyKey: jobKey("icai-sync", "resume", next ? `${runId}:${next.source_index}:${next.cursor_offset}` : `${runId}:finalize`), payload: next ? { trigger: "manual", mode: "source", runId, sourceIds, sourceIndex: Number(next.source_index), requestedBy: operator.user.id } : { trigger: "manual", mode: "finalize", runId, requestedBy: operator.user.id }, createdBy: operator.user.id });
      const update = await admin.from("icai_sync_runtime").update({ pause_requested: false, paused_at: null, stage: "selecting_sources", control_requested_by: operator.user.id, control_reason: "admin_resume", updated_at: new Date().toISOString() }).eq("run_id", runId).eq("stage", "paused");
      if (update.error) throw update.error;
      destination = "/admin/icai-sync?notice=Synchronization%20resumed.";
    } else {
      const values = intent === "pause" ? { pause_requested: true, control_reason: "admin_pause_after_batch" } : intent === "cancel" ? { cancel_requested: true, control_reason: "admin_cancel" } : { skip_source_requested: true, control_reason: "admin_skip_source" };
      const update = await admin.from("icai_sync_runtime").update({ ...values, control_requested_by: operator.user.id, updated_at: new Date().toISOString() }).eq("run_id", runId);
      if (update.error) throw update.error;
      destination = `/admin/icai-sync?notice=${encodeURIComponent(intent === "pause" ? "Pause requested. The worker will pause after the current batch." : intent === "cancel" ? "Cancellation requested. The worker will stop at its next checkpoint." : "Skip requested. The worker will preserve existing data and continue with the next source.")}`;
    }
    await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.run", action: `icai.sync.${intent}`, targetType: "icai_sync_run", targetId: runId, reason: intent === "recover" ? "Stale heartbeat recovery" : intent === "cancel" ? "Administrator cancellation request" : "Administrator source-skip request", previousValue: { stage: current.data.stage, heartbeatAt: current.data.heartbeat_at }, newValue: { intent }, traceId: traceId(), reversible: false });
    revalidatePath("/admin/icai-sync");
  } catch (error) { destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`; }
  redirect(destination);
}

export async function restoreIcaiItemAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminCapability("icai.run");
    const skipId = String(formData.get("skipId") ?? "").trim();
    const admin = createD1AdminClient();
    const current = await admin.from("icai_sync_item_skips").select("id,source_id,item_url,is_active").eq("id", skipId).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) throw new Error("Skipped ICAI file was not found.");
    if (current.data.is_active) {
      const update = await admin.from("icai_sync_item_skips").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", skipId).eq("is_active", true);
      if (update.error) throw update.error;
      await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.run", action: "icai.sync.restore_item", targetType: "icai_source_item", targetId: current.data.item_url, previousValue: { skipped: true }, newValue: { skipped: false }, traceId: traceId(), reversible: false });
    }
    destination = "/admin/icai-sync?notice=ICAI%20file%20restored.";
  } catch (error) { destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`; }
  revalidatePath("/admin/icai-sync"); redirect(destination);
}

export async function excludeIcaiSourceAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminCapability("icai.run");
    const sourceId = String(formData.get("sourceId") ?? "").trim();
    const admin = createD1AdminClient();
    const source = await admin.from("icai_sources").select("id,excluded_until").eq("id", sourceId).maybeSingle();
    if (source.error) throw source.error;
    if (!source.data) throw new Error("ICAI source was not found.");
    const until = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const update = await admin.from("icai_sources").update({ excluded_until: until, exclusion_reason: "Temporarily excluded by administrator", updated_at: new Date().toISOString() }).eq("id", sourceId);
    if (update.error) throw update.error;
    await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.run", action: "icai.sync.exclude_source", targetType: "icai_source", targetId: sourceId, previousValue: { excludedUntil: source.data.excluded_until }, newValue: { excludedUntil: until }, traceId: traceId(), reversible: true });
    destination = "/admin/icai-sync?notice=Source%20excluded%20for%2024%20hours.";
  } catch (error) { destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`; }
  revalidatePath("/admin/icai-sync"); redirect(destination);
}

export async function runTargetedIcaiSyncAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminCapability("icai.run");
    const mode = String(formData.get("mode") ?? "one");
    const sourceId = String(formData.get("sourceId") ?? "").trim();
    const admin = createD1AdminClient();
    const active = await admin.from("icai_sync_runs").select("id").eq("status", "running").limit(1).maybeSingle();
    if (active.error) throw active.error;
    if (active.data) throw new Error("Another ICAI synchronization is already active.");
    let sourceIds = sourceId ? [sourceId] : [];
    if (mode === "failed_only") {
      const latest = await admin.from("icai_sync_runs").select("id").in("status", ["failed", "partial"]).order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (latest.error) throw latest.error;
      const failed = latest.data ? await admin.from("icai_sync_source_states").select("source_id").eq("run_id", latest.data.id).eq("status", "failed") : { data: [], error: null };
      if (failed.error) throw failed.error;
      sourceIds = (failed.data ?? []).map((row: { source_id: unknown }) => String(row.source_id));
    }
    if (!sourceIds.length) throw new Error("No source is available for this targeted run.");
    const forceRecheck = mode === "force" || mode === "retry_batch" || mode === "retry_source";
    const scope = `${mode}:${sourceIds.sort().join(",")}:${new Date().toISOString().slice(0, 16)}`;
    const job = await enqueueBackgroundJob({ type: "icai-sync", idempotencyKey: jobKey("icai-sync", "targeted", scope), payload: { trigger: "manual", requestedBy: operator.user.id, requestedSourceIds: sourceIds, forceRecheck }, createdBy: operator.user.id });
    await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.run", action: `icai.sync.${mode}`, targetType: "background_job", targetId: job.id, newValue: { sourceIds, forceRecheck }, traceId: traceId(), reversible: false });
    destination = `/admin/icai-sync?notice=${encodeURIComponent(`Targeted sync queued for ${sourceIds.length} source(s).`)}`;
  } catch (error) { destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`; }
  revalidatePath("/admin/icai-sync"); redirect(destination);
}

export async function skipIcaiItemAction(formData: FormData) {
  let destination = "/admin/icai-sync";
  try {
    const operator = await requireAdminCapability("icai.run");
    const runId = String(formData.get("runId") ?? "").trim();
    const sourceId = String(formData.get("sourceId") ?? "").trim();
    const itemUrl = String(formData.get("itemUrl") ?? "").trim();
    const scope = formData.get("scope") === "permanent" ? "permanent" : "temporary";
    if (!runId || !sourceId || itemUrl.length > 2000 || !isApprovedIcaiUrl(itemUrl)) throw new Error("Invalid ICAI file-skip request.");
    const admin = createD1AdminClient();
    const runtime = await admin.from("icai_sync_runtime").select("run_id,current_source_id,current_item_url").eq("run_id", runId).maybeSingle();
    if (runtime.error) throw runtime.error;
    if (!runtime.data || runtime.data.current_source_id !== sourceId || runtime.data.current_item_url !== itemUrl) throw new Error("The worker has already moved past this ICAI file.");
    const existing = await admin.from("icai_sync_item_skips").select("id").eq("source_id", sourceId).eq("item_url", itemUrl).maybeSingle();
    if (existing.error) throw existing.error;
    const now = new Date();
    const skippedUntil = scope === "temporary" ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
    const values = { scope, reason: "Skipped from the ICAI live monitor", skipped_until: skippedUntil, is_active: true, created_by: operator.user.id, updated_at: now.toISOString() };
    const saved = existing.data
      ? await admin.from("icai_sync_item_skips").update(values).eq("id", existing.data.id)
      : await admin.from("icai_sync_item_skips").insert({ id: crypto.randomUUID(), source_id: sourceId, item_url: itemUrl, ...values, created_at: now.toISOString() });
    if (saved.error) throw saved.error;
    await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.run", action: "icai.sync.skip_item", targetType: "icai_source_item", targetId: itemUrl, reason: `${scope} ICAI item skip`, newValue: { runId, sourceId, scope, skippedUntil }, traceId: traceId(), reversible: true });
    destination = `/admin/icai-sync?notice=${encodeURIComponent(scope === "permanent" ? "This ICAI file will remain skipped until restored." : "This ICAI file will be skipped for 24 hours.")}`;
    revalidatePath("/admin/icai-sync");
  } catch (error) { destination = `/admin/icai-sync?error=${encodeURIComponent(message(error))}`; }
  redirect(destination);
}

export async function decideIcaiReviewAction(formData: FormData) {
  let destination = "/admin/icai-sync/data";
  try {
    const operator = await requireAdminCapability("icai.review");
    const reviewId = String(formData.get("reviewId") ?? "");
    const decision = normalizeIcaiReviewDecision(formData.get("decision"));
    if (!reviewId || !decision) throw new Error("Invalid review request.");
    const result = await decideIcaiReview({ reviewId, decision, reviewerUserId: operator.user.id, notes: "" });
    await recordAdminAuditEvent({ actorUserId: operator.user.id, actorRole: operator.role, capability: "icai.review", action: `icai.review.${decision}`, targetType: "icai_review", targetId: reviewId, reason: "ICAI high-impact review decision", newValue: { status: result.status }, traceId: traceId(), reversible: false });
    await invalidateSharedPublicCache(["icai"]);
    revalidatePath("/admin/icai-sync"); revalidatePath("/admin/icai-sync/data"); revalidatePath("/updates"); revalidatePath("/resources/icai");
    destination = `/admin/icai-sync/data?notice=${encodeURIComponent(`Review ${result.status}. Student-facing data and audit history are now consistent.`)}`;
  } catch (error) { destination = `/admin/icai-sync/data?error=${encodeURIComponent(message(error))}`; }
  redirect(destination);
}
