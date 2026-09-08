export type IcaiSyncLiveSourceState =
  | "running"
  | "fetched"
  | "failed"
  | "pending"
  | "not_run";

export type IcaiSyncLiveStatus = {
  observedAt: string;
  active: boolean;
  terminal: boolean;
  runId: string | null;
  job: {
    id: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    startedAt: string | null;
    lastError: string | null;
    stale: boolean;
  } | null;
  run: {
    status: string;
    triggerType: string;
    startedAt: string;
    completedAt: string | null;
    processed: number;
    total: number;
    succeeded: number;
    failed: number;
    newItems: number;
    changedItems: number;
    unchangedItems: number;
    removedItems: number;
    pendingReviews: number;
  } | null;
  runtime: {
    stage: string;
    currentSourceId: string | null;
    currentSourceName: string | null;
    currentItemUrl: string | null;
    stageStartedAt: string;
    heartbeatAt: string;
    stale: boolean;
    cancelRequested: boolean;
    skipSourceRequested: boolean;
  } | null;
  sourceResults: Array<{
    sourceId: string;
    sourceName: string;
    state: IcaiSyncLiveSourceState;
    httpStatus: number | null;
    parsedItemCount: number | null;
    changed: boolean | null;
    fetchedAt: string | null;
    error: string | null;
  }>;
  latestFailure: string | null;
  nextScheduledGroup: {
    id: string;
    label: string;
    dueAt: string;
  } | null;
};

export const ICAI_STAGE_PROGRESS: Record<string, number> = {
  queued: 0,
  acquiring_lock: 2,
  selecting_sources: 5,
  fetching: 10,
  validating: 25,
  parsing: 45,
  comparing: 65,
  writing: 85,
  finalizing: 95,
  waiting_for_review: 98,
  completed: 100,
  success: 100,
  partial: 100,
  failed: 100,
  cancelled: 100,
};

export const ICAI_TERMINAL_RUN_STATUSES = new Set([
  "success",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);
