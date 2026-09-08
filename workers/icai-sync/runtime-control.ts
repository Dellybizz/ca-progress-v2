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
}

export async function initializeRuntime(db: D1Database, runId: string) {
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO icai_sync_runtime(run_id,stage,stage_started_at,heartbeat_at,updated_at) VALUES(?1,'selecting_sources',?2,?2,?2)",
    )
    .bind(runId, now)
    .run();
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

export async function checkpoint(db: D1Database, runId: string) {
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
  await heartbeat(db, runId);
}
