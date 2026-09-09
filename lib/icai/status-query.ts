import "server-only";

import { createD1AdminClient } from "@/lib/data/d1/client";
import {
  ICAI_TERMINAL_RUN_STATUSES,
  ICAI_STAGE_PROGRESS,
  ICAI_STALL_THRESHOLD_MS,
  type IcaiSyncDisplayState,
  type IcaiSyncLiveSourceState,
  type IcaiSyncLiveStatus,
} from "./live-status";

const RUN_COLUMNS =
  "id,status,trigger_type,started_at,completed_at,source_total,source_processed,source_succeeded,source_failed,new_items,changed_items,unchanged_items,removed_items,pending_reviews,error_summary";
const RUNTIME_COLUMNS =
  "run_id,stage,current_source_id,current_item_url,stage_started_at,heartbeat_at,cancel_requested,skip_source_requested";
const SNAPSHOT_COLUMNS =
  "source_id,http_status,parsed_item_count,is_changed,fetched_at";
const SOURCE_COLUMNS = "id,name,last_error,last_error_at,is_active";
const JOB_COLUMNS =
  "id,status,attempts,max_attempts,payload_json,available_at,created_at,started_at,finished_at,last_error,updated_at";

function asString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function asNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isStale(value: unknown) {
  const timestamp = new Date(String(value ?? "")).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp > ICAI_STALL_THRESHOLD_MS;
}

function isJobStale(job: Record<string, unknown>) {
  return isStale(job.updated_at ?? job.started_at ?? job.created_at);
}

function isActiveJob(job: Record<string, unknown>, now: Date) {
  if (job.status === "queued" || job.status === "running") return true;
  const retryAt = new Date(String(job.available_at ?? "")).getTime();
  return job.status === "failed" && Number.isFinite(retryAt) && retryAt > now.getTime();
}

function jobRunId(job: Record<string, unknown>) {
  try {
    const payload = JSON.parse(String(job.payload_json ?? "{}")) as Record<string, unknown>;
    return asString(payload.runId);
  } catch { return null; }
}

function displayState(job: Record<string, unknown> | null, runStatus: string | null, stage: string | null, stale: boolean): IcaiSyncDisplayState {
  if (stale) return "stalled";
  if (job?.status === "failed") return "queued";
  if (!runStatus) return job?.status === "queued" ? "queued" : job?.status === "failed" || job?.status === "dead_letter" ? "failed" : "queued";
  if (["success", "completed"].includes(runStatus)) return "completed";
  if (runStatus === "failed" || runStatus === "partial" || runStatus === "cancelled") return "failed";
  if (!stage || ["queued", "acquiring_lock"].includes(stage)) return "queued";
  if (["selecting_sources", "validating", "parsing"].includes(stage)) return "discovering";
  if (stage === "fetching") return "fetching";
  if (stage === "comparing") return "comparing";
  if (stage === "writing") return "writing";
  if (stage === "finalizing") return "finalizing";
  if (stage === "paused") return "paused";
  if (stage === "failed" || stage === "cancelled" || stage === "partial") return "failed";
  return "queued";
}

function nextDailySync(observedAt: Date) {
  const due = new Date(observedAt);
  due.setUTCHours(0, 30, 0, 0);
  if (due <= observedAt) due.setUTCDate(due.getUTCDate() + 1);
  return { id: "daily-all-sources", label: "All 6 sources · daily 06:00 IST", dueAt: due.toISOString() };
}

export async function getIcaiSyncLiveStatus(
  requestedRunId?: string | null,
): Promise<IcaiSyncLiveStatus> {
  const client = createD1AdminClient();
  const runQuery = client.from("icai_sync_runs").select(RUN_COLUMNS);
  const runPromise = requestedRunId
    ? runQuery.eq("id", requestedRunId).maybeSingle()
    : runQuery
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
  const jobPromise = client
    .from("background_jobs")
    .select(JOB_COLUMNS)
    .eq("job_type", "icai-sync")
    .in("status", ["queued", "running", "failed"])
    .order("created_at", { ascending: false })
    .limit(20);

  const [runResponse, jobResponse] = await Promise.all([runPromise, jobPromise]);
  if (runResponse.error) throw runResponse.error;
  if (jobResponse.error) throw jobResponse.error;

  const run = runResponse.data as Record<string, unknown> | null;
  const observedAt = new Date();
  const jobs = ((jobResponse.data ?? []) as Array<Record<string, unknown>>).filter((item) => isActiveJob(item, observedAt));
  const runId = asString(run?.id);
  const job = (runId ? jobs.find((item) => jobRunId(item) === runId) : jobs[0]) ?? null;

  if (!run || !runId) {
    return {
      observedAt: observedAt.toISOString(),
      active: Boolean(job),
      anotherSyncActive: Boolean(job),
      terminal: false,
      displayState: displayState(job, null, null, Boolean(job && isJobStale(job))),
      overallPercent: 0,
      estimatedCompletionAt: null,
      runId: null,
      job: job
        ? {
            id: String(job.id),
            status: String(job.status),
            attempts: asNumber(job.attempts),
            maxAttempts: asNumber(job.max_attempts),
            createdAt: String(job.created_at),
            startedAt: asString(job.started_at),
            lastError: asString(job.last_error),
            stale: isJobStale(job),
            nextRetryAt: job.status === "failed" ? asString(job.available_at) : null,
          }
        : null,
      run: null,
      runtime: null,
      sourceResults: [],
      latestFailure: asString(job?.last_error),
      nextScheduledGroup: nextDailySync(observedAt),
    };
  }

  const [runtimeResponse, snapshotResponse, sourceResponse, stateResponse] = await Promise.all([
    client
      .from("icai_sync_runtime")
      .select(RUNTIME_COLUMNS)
      .eq("run_id", runId)
      .maybeSingle(),
    client
      .from("icai_source_snapshots")
      .select(SNAPSHOT_COLUMNS)
      .eq("run_id", runId),
    client
      .from("icai_sources")
      .select(SOURCE_COLUMNS)
      .eq("is_active", true)
      .order("id"),
    client
      .from("icai_sync_source_states")
      .select("source_id,source_index,status,attempts,cursor_offset,cursor_total,continuation_count,updated_at")
      .eq("run_id", runId),
  ]);
  const firstError = [
    runtimeResponse.error,
    snapshotResponse.error,
    sourceResponse.error,
    stateResponse.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const runtime = runtimeResponse.data as Record<string, unknown> | null;
  const snapshots = (snapshotResponse.data ?? []) as Array<Record<string, unknown>>;
  const sources = (sourceResponse.data ?? []) as Array<Record<string, unknown>>;
  const sourceStates = (stateResponse.data ?? []) as Array<Record<string, unknown>>;
  const snapshotBySource = new Map(
    snapshots.map((snapshot) => [String(snapshot.source_id), snapshot]),
  );
  const sourceById = new Map(
    sources.map((source) => [String(source.id), source]),
  );
  const stateBySource = new Map(sourceStates.map((state) => [String(state.source_id), state]));
  const runStatus = String(run.status);
  const active = Boolean(job) || runStatus === "running";
  const terminal = !active && ICAI_TERMINAL_RUN_STATUSES.has(runStatus);
  const currentSourceId = asString(runtime?.current_source_id);
  const startedAt = String(run.started_at);

  const sourceResults = sources.map((source) => {
    const sourceId = String(source.id);
    const snapshot = snapshotBySource.get(sourceId);
    const sourceState = stateBySource.get(sourceId);
    const lastErrorAt = asString(source.last_error_at);
    const failedThisRun = Boolean(lastErrorAt && lastErrorAt >= startedAt);
    let state: IcaiSyncLiveSourceState;
    if (sourceState?.status === "failed") state = "failed";
    else if (sourceState?.status === "skipped") state = "skipped";
    else if (sourceState?.status === "cancelled") state = "not_run";
    else if (sourceState?.status === "succeeded" || snapshot) state = "fetched";
    else if (sourceState?.status === "running" || (sourceId === currentSourceId && active)) state = "running";
    else if (failedThisRun) state = "failed";
    else if (terminal) state = "not_run";
    else state = "pending";
    return {
      sourceId,
      sourceName: String(source.name),
      state,
      httpStatus: snapshot ? asNumber(snapshot.http_status) : null,
      parsedItemCount: snapshot ? asNumber(snapshot.parsed_item_count) : null,
      changed: snapshot ? Boolean(snapshot.is_changed) : null,
      fetchedAt: snapshot ? asString(snapshot.fetched_at) : null,
      error: failedThisRun ? asString(source.last_error) : null,
    };
  });

  const sourceFailure = sources.find((source) => {
    const lastErrorAt = asString(source.last_error_at);
    return Boolean(lastErrorAt && lastErrorAt >= startedAt && source.last_error);
  });
  const currentSource = currentSourceId
    ? sourceById.get(currentSourceId) ?? null
    : null;
  const currentState = currentSourceId ? stateBySource.get(currentSourceId) : null;
  const runtimeStale = Boolean(runtime && isStale(runtime.heartbeat_at));
  const canonicalState = displayState(job, runStatus, asString(runtime?.stage), runtimeStale || Boolean(job && !runtime && isJobStale(job)));
  const processed = asNumber(run.source_processed);
  const total = asNumber(run.source_total);
  const stageProgress = runtime ? (ICAI_STAGE_PROGRESS[String(runtime.stage)] ?? 0) : 0;
  const overallPercent = terminal ? 100 : total ? Math.min(99, Math.round(((processed + stageProgress / 100) / total) * 100)) : 0;
  const elapsedMs = Math.max(0, observedAt.getTime() - new Date(startedAt).getTime());
  const completedUnits = processed + stageProgress / 100;
  const remainingMs = completedUnits > 0 ? (elapsedMs / completedUnits) * Math.max(0, total - completedUnits) : 0;
  const estimatedCompletionAt = active && remainingMs > 0 && Number.isFinite(remainingMs) ? new Date(observedAt.getTime() + remainingMs).toISOString() : null;

  return {
    observedAt: observedAt.toISOString(),
    active,
    anotherSyncActive: active,
    terminal,
    displayState: canonicalState,
    overallPercent,
    estimatedCompletionAt,
    runId,
    job: job
      ? {
          id: String(job.id),
          status: String(job.status),
          attempts: asNumber(job.attempts),
          maxAttempts: asNumber(job.max_attempts),
          createdAt: String(job.created_at),
          startedAt: asString(job.started_at),
          lastError: asString(job.last_error),
          stale: isJobStale(job),
          nextRetryAt: job.status === "failed" ? asString(job.available_at) : null,
        }
      : null,
    run: {
      status: runStatus,
      triggerType: String(run.trigger_type),
      startedAt,
      completedAt: asString(run.completed_at),
      processed,
      total,
      succeeded: asNumber(run.source_succeeded),
      failed: asNumber(run.source_failed),
      newItems: asNumber(run.new_items),
      changedItems: asNumber(run.changed_items),
      unchangedItems: asNumber(run.unchanged_items),
      removedItems: asNumber(run.removed_items),
      pendingReviews: asNumber(run.pending_reviews),
    },
    runtime: runtime
      ? {
          stage: String(runtime.stage),
          currentSourceId,
          currentSourceName: currentSource ? String(currentSource.name) : null,
          currentItemUrl: asString(runtime.current_item_url),
          stageStartedAt: String(runtime.stage_started_at),
          heartbeatAt: String(runtime.heartbeat_at),
          stale: runtimeStale,
          cancelRequested: Boolean(runtime.cancel_requested),
          skipSourceRequested: Boolean(runtime.skip_source_requested),
          cursorOffset: asNumber(currentState?.cursor_offset),
          cursorTotal: asNumber(currentState?.cursor_total),
          continuationCount: asNumber(currentState?.continuation_count),
          sourceIndex: asNumber(currentState?.source_index),
          batchNumber: asNumber(currentState?.continuation_count) + 1,
          processedItems: asNumber(currentState?.cursor_offset),
          remainingItems: Math.max(0, asNumber(currentState?.cursor_total) - asNumber(currentState?.cursor_offset)),
        }
      : null,
    sourceResults,
    latestFailure:
      asString(run.error_summary) ??
      asString(job?.last_error) ??
      asString(sourceFailure?.last_error),
    nextScheduledGroup: nextDailySync(observedAt),
  };
}
