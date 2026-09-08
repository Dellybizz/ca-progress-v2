import "server-only";

import { createD1AdminClient } from "@/lib/data/d1/client";
import {
  ICAI_TERMINAL_RUN_STATUSES,
  type IcaiSyncLiveItemState,
  type IcaiSyncLiveSourceState,
  type IcaiSyncLiveStatus,
} from "./live-status";

const RUN_COLUMNS =
  "id,status,trigger_type,started_at,completed_at,source_total,source_processed,source_succeeded,source_failed,new_items,changed_items,unchanged_items,removed_items,pending_reviews,error_summary";
const RUNTIME_COLUMNS =
  "run_id,stage,current_source_id,current_item_url,stage_started_at,heartbeat_at,cancel_requested,skip_source_requested";
const SNAPSHOT_COLUMNS =
  "source_id,http_status,parsed_item_count,is_changed,fetched_at";
const SOURCE_COLUMNS = "id,name,official_url,last_error,last_error_at,is_active";
const JOB_COLUMNS =
  "id,status,attempts,max_attempts,created_at,started_at,last_error";
const ITEM_COLUMNS =
  "id,run_id,source_id,item_url,item_type,item_title,status,stage,attempts,http_status,started_at,completed_at,duration_ms,bytes_fetched,parsed_count,failure_category,failure_message,skip_reason,retry_eligible,admin_note,created_at";
const ITEM_CONTROL_COLUMNS =
  "run_id,skip_item_requested,skip_remaining_requested";

function asString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function asNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isStale(value: unknown) {
  const timestamp = new Date(String(value ?? "")).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp > 2 * 60_000;
}

function itemState(value: unknown): IcaiSyncLiveItemState {
  const state = String(value ?? "pending");
  return [
    "pending",
    "running",
    "succeeded",
    "failed",
    "timed_out",
    "skipped",
  ].includes(state)
    ? (state as IcaiSyncLiveItemState)
    : "failed";
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
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [runResponse, jobResponse] = await Promise.all([runPromise, jobPromise]);
  if (runResponse.error) throw runResponse.error;
  if (jobResponse.error) throw jobResponse.error;

  const run = runResponse.data as Record<string, unknown> | null;
  const job = jobResponse.data as Record<string, unknown> | null;
  const runId = asString(run?.id);

  if (!run || !runId) {
    return {
      observedAt: new Date().toISOString(),
      active: Boolean(job),
      terminal: false,
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
          }
        : null,
      run: null,
      runtime: null,
      sourceResults: [],
      itemResults: [],
      latestFailure: asString(job?.last_error),
      nextScheduledGroup: null,
      scheduleError: null,
    };
  }

  const [
    runtimeResponse,
    snapshotResponse,
    sourceResponse,
    itemResponse,
    itemControlResponse,
  ] = await Promise.all([
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
      .from("icai_sync_items")
      .select(ITEM_COLUMNS)
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("icai_sync_item_controls")
      .select(ITEM_CONTROL_COLUMNS)
      .eq("run_id", runId)
      .maybeSingle(),
  ]);
  const firstError = [
    runtimeResponse.error,
    snapshotResponse.error,
    sourceResponse.error,
    itemResponse.error,
    itemControlResponse.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const runtime = runtimeResponse.data as Record<string, unknown> | null;
  const itemControl = itemControlResponse.data as Record<string, unknown> | null;
  const snapshots = (snapshotResponse.data ?? []) as Array<Record<string, unknown>>;
  const sources = (sourceResponse.data ?? []) as Array<Record<string, unknown>>;
  const items = (itemResponse.data ?? []) as Array<Record<string, unknown>>;
  const snapshotBySource = new Map(
    snapshots.map((snapshot) => [String(snapshot.source_id), snapshot]),
  );
  const sourceById = new Map(
    sources.map((source) => [String(source.id), source]),
  );
  const runStatus = String(run.status);
  const active = Boolean(job) || runStatus === "running";
  const terminal = !active && ICAI_TERMINAL_RUN_STATUSES.has(runStatus);
  const currentSourceId = asString(runtime?.current_source_id);
  const startedAt = String(run.started_at);

  const sourceResults = sources.map((source) => {
    const sourceId = String(source.id);
    const snapshot = snapshotBySource.get(sourceId);
    const lastErrorAt = asString(source.last_error_at);
    const failedThisRun = Boolean(lastErrorAt && lastErrorAt >= startedAt);
    let state: IcaiSyncLiveSourceState;
    if (snapshot && failedThisRun) state = "failed";
    else if (snapshot) state = "fetched";
    else if (failedThisRun) state = "failed";
    else if (sourceId === currentSourceId && active) state = "running";
    else if (terminal) state = "not_run";
    else state = "pending";
    return {
      sourceId,
      sourceName: String(source.name),
      officialUrl: String(source.official_url),
      state,
      httpStatus: snapshot ? asNumber(snapshot.http_status) : null,
      parsedItemCount: snapshot ? asNumber(snapshot.parsed_item_count) : null,
      changed: snapshot ? Boolean(snapshot.is_changed) : null,
      fetchedAt: snapshot ? asString(snapshot.fetched_at) : null,
      error: failedThisRun ? asString(source.last_error) : null,
    };
  });

  const itemResults = items.map((item) => {
    const source = sourceById.get(String(item.source_id));
    return {
      id: String(item.id),
      sourceId: String(item.source_id),
      sourceName: source ? String(source.name) : String(item.source_id),
      itemUrl: String(item.item_url),
      itemType: String(item.item_type),
      itemTitle: asString(item.item_title),
      status: itemState(item.status),
      stage: String(item.stage),
      attempts: asNumber(item.attempts),
      httpStatus: nullableNumber(item.http_status),
      startedAt: asString(item.started_at),
      completedAt: asString(item.completed_at),
      durationMs: nullableNumber(item.duration_ms),
      bytesFetched: asNumber(item.bytes_fetched),
      parsedCount: asNumber(item.parsed_count),
      failureCategory: asString(item.failure_category),
      failureMessage: asString(item.failure_message),
      skipReason: asString(item.skip_reason),
      retryEligible: Boolean(item.retry_eligible),
      adminNote: asString(item.admin_note),
    };
  });

  const sourceFailure = sources.find((source) => {
    const lastErrorAt = asString(source.last_error_at);
    return Boolean(lastErrorAt && lastErrorAt >= startedAt && source.last_error);
  });
  const itemFailure = itemResults.find(
    (item) => item.status === "failed" || item.status === "timed_out",
  );
  const currentSource = currentSourceId
    ? sourceById.get(currentSourceId) ?? null
    : null;

  return {
    observedAt: new Date().toISOString(),
    active,
    terminal,
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
        }
      : null,
    run: {
      status: runStatus,
      triggerType: String(run.trigger_type),
      startedAt,
      completedAt: asString(run.completed_at),
      processed: asNumber(run.source_processed),
      total: asNumber(run.source_total),
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
          stale: isStale(runtime.heartbeat_at),
          cancelRequested: Boolean(runtime.cancel_requested),
          skipSourceRequested: Boolean(runtime.skip_source_requested),
          skipItemRequested: Boolean(itemControl?.skip_item_requested),
          skipRemainingRequested: Boolean(itemControl?.skip_remaining_requested),
        }
      : null,
    sourceResults,
    itemResults,
    latestFailure:
      itemFailure?.failureMessage ??
      asString(run.error_summary) ??
      asString(job?.last_error) ??
      asString(sourceFailure?.last_error),
    nextScheduledGroup: null,
    scheduleError: null,
  };
}
