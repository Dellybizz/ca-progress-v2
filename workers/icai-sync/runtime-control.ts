import type { D1Database } from "./d1-client";

export type SyncStage =
  | "acquiring_lock"
  | "selecting_sources"
  | "fetching"
  | "validating"
  | "parsing"
  | "comparing"
  | "writing"
  | "finalizing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export class SyncCancelledError extends Error {
  constructor() {
    super("ICAI synchronization was cancelled by an administrator.");
    this.name = "SyncCancelledError";
  }
}
export class SyncSourceSkippedError extends Error {
  constructor() {
    super("Source skipped by an administrator.");
    this.name = "SyncSourceSkippedError";
  }
}
export class SyncItemSkippedError extends Error {
  constructor() {
    super("Current item skipped by an administrator.");
    this.name = "SyncItemSkippedError";
  }
}
export class SyncRemainingItemsSkippedError extends Error {
  constructor() {
    super("Remaining items for this source were skipped by an administrator.");
    this.name = "SyncRemainingItemsSkippedError";
  }
}

export async function recoverStaleRuns(db: D1Database) {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  await db
    .prepare(
      "UPDATE icai_sync_runs SET status='failed',completed_at=CURRENT_TIMESTAMP,error_summary=COALESCE(error_summary,'Run recovered after heartbeat stopped for more than two minutes.') WHERE status='running' AND id IN (SELECT run_id FROM icai_sync_runtime WHERE heartbeat_at < ?1)",
    )
    .bind(cutoff)
    .run();
  await db
    .prepare(
      "UPDATE icai_sync_runtime SET stage='failed',updated_at=CURRENT_TIMESTAMP WHERE stage NOT IN ('completed','partial','failed','cancelled') AND heartbeat_at < ?1",
    )
    .bind(cutoff)
    .run();
  await db
    .prepare(
      "UPDATE icai_sync_items SET status='failed',stage='stale_recovery',completed_at=CURRENT_TIMESTAMP,failure_category='stale_recovery',failure_message=COALESCE(failure_message,'Item was active when its sync run became stale.'),retry_eligible=1,updated_at=CURRENT_TIMESTAMP WHERE status='running' AND run_id IN (SELECT id FROM icai_sync_runs WHERE status='failed' AND completed_at>=?1)",
    )
    .bind(cutoff)
    .run()
    .catch(() => undefined);
}

export async function initializeRuntime(db: D1Database, runId: string) {
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO icai_sync_runtime(run_id,stage,stage_started_at,heartbeat_at,updated_at) VALUES(?1,'selecting_sources',?2,?2,?2)",
    )
    .bind(runId, now)
    .run();
  await db
    .prepare(
      "INSERT OR IGNORE INTO icai_sync_item_controls(run_id,updated_at) VALUES(?1,?2)",
    )
    .bind(runId, now)
    .run()
    .catch(() => undefined);
}

export async function setStage(
  db: D1Database,
  runId: string,
  stage: SyncStage,
  sourceId: string | null = null,
  itemUrl: string | null = null,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      "UPDATE icai_sync_runtime SET stage=?1,current_source_id=?2,current_item_url=?3,stage_started_at=?4,heartbeat_at=?4,updated_at=?4 WHERE run_id=?5",
    )
    .bind(stage, sourceId, itemUrl, now, runId)
    .run();
}

export async function heartbeat(db: D1Database, runId: string) {
  await db
    .prepare(
      "UPDATE icai_sync_runtime SET heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE run_id=?1",
    )
    .bind(runId)
    .run();
}

export async function checkpoint(
  db: D1Database,
  runId: string,
  scope: "source" | "item" = "source",
) {
  const control = await db
    .prepare(
      "SELECT cancel_requested,skip_source_requested FROM icai_sync_runtime WHERE run_id=?1",
    )
    .bind(runId)
    .first<{ cancel_requested: number; skip_source_requested: number }>();
  if (control?.cancel_requested) throw new SyncCancelledError();
  if (control?.skip_source_requested) {
    await db
      .prepare(
        "UPDATE icai_sync_runtime SET skip_source_requested=0,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE run_id=?1",
      )
      .bind(runId)
      .run();
    throw new SyncSourceSkippedError();
  }

  if (scope === "item") {
    const itemControl = await db
      .prepare(
        "SELECT skip_item_requested,skip_remaining_requested FROM icai_sync_item_controls WHERE run_id=?1",
      )
      .bind(runId)
      .first<{
        skip_item_requested: number;
        skip_remaining_requested: number;
      }>()
      .catch(() => null);
    if (itemControl?.skip_remaining_requested) {
      await db
        .prepare(
          "UPDATE icai_sync_item_controls SET skip_item_requested=0,skip_remaining_requested=0,updated_at=CURRENT_TIMESTAMP WHERE run_id=?1",
        )
        .bind(runId)
        .run();
      throw new SyncRemainingItemsSkippedError();
    }
    if (itemControl?.skip_item_requested) {
      await db
        .prepare(
          "UPDATE icai_sync_item_controls SET skip_item_requested=0,updated_at=CURRENT_TIMESTAMP WHERE run_id=?1",
        )
        .bind(runId)
        .run();
      throw new SyncItemSkippedError();
    }
  }

  await heartbeat(db, runId);
}
