export type IcaiSyncLiveSourceState =
  | "running"
  | "fetched"
  | "failed"
  | "skipped"
  | "pending"
  | "not_run";

export type IcaiSyncDisplayState =
  | "queued"
  | "discovering"
  | "fetching"
  | "comparing"
  | "writing"
  | "finalizing"
  | "paused"
  | "stalled"
  | "skipped"
  | "failed"
  | "completed";

export type IcaiSyncLiveStatus = {
  observedAt: string;
  active: boolean;
  anotherSyncActive: boolean;
  terminal: boolean;
  displayState: IcaiSyncDisplayState;
  overallPercent: number;
  estimatedCompletionAt: string | null;
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
    nextRetryAt: string | null;
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
    cursorOffset: number;
    cursorTotal: number;
    continuationCount: number;
    sourceIndex: number;
    batchNumber: number;
    processedItems: number;
    remainingItems: number;
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
  paused: 95,
  waiting_for_review: 98,
  completed: 100,
  success: 100,
  partial: 100,
  failed: 100,
  cancelled: 100,
};

export const ICAI_STALL_THRESHOLD_MS = 2 * 60_000;

export const ICAI_TERMINAL_RUN_STATUSES = new Set([
  "success",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);
