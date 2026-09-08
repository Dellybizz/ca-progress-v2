import type { D1Database, D1Statement } from "./d1-client";
import { recordIcaiSourceScheduleResult } from "../../lib/icai/scheduler";

const ACTIVE_SOURCE_QUERY =
  'SELECT * FROM "icai_sources" WHERE "is_active"=? ORDER BY "id" ASC';

type ScheduleSnapshot = {
  fetched_at: string | null;
  content_length: number | null;
  parsed_item_count: number | null;
};

type ItemMetrics = {
  item_count: number | null;
  failure_count: number | null;
  started_at: string | null;
  completed_at: string | null;
  bytes_fetched: number | null;
};

class ScopedSelectStatement implements D1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: D1Database,
    private readonly query: string,
    private readonly sourceIds: string[],
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  private statement() {
    return this.db
      .prepare(this.query)
      .bind(...this.values, ...this.sourceIds);
  }

  first<T = Record<string, unknown>>() {
    return this.statement().first<T>();
  }

  all<T = Record<string, unknown>>() {
    return this.statement().all<T>();
  }

  run<T = Record<string, unknown>>() {
    return this.statement().run<T>();
  }
}

export function scopeIcaiSourceDatabase(
  db: D1Database,
  sourceIds: string[] | null,
): D1Database {
  if (!sourceIds?.length) return db;
  const selected = [...new Set(sourceIds)];
  const placeholders = selected.map(() => "?").join(",");
  const scopedQuery = ACTIVE_SOURCE_QUERY.replace(
    ' ORDER BY "id" ASC',
    ` AND "id" IN (${placeholders}) ORDER BY "id" ASC`,
  );

  return {
    prepare(query: string) {
      if (query === ACTIVE_SOURCE_QUERY) {
        return new ScopedSelectStatement(db, scopedQuery, selected);
      }
      return db.prepare(query);
    },
    batch<T = Record<string, unknown>>(statements: D1Statement[]) {
      return db.batch<T>(statements);
    },
  };
}

function durationMs(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

export async function recordIcaiScheduledSourceOutcomes(
  db: D1Database,
  runId: string,
  sourceIds: string[],
) {
  for (const sourceId of sourceIds) {
    const [snapshot, metrics] = await Promise.all([
      db
        .prepare(
          "SELECT fetched_at,content_length,parsed_item_count FROM icai_source_snapshots WHERE run_id=?1 AND source_id=?2 ORDER BY fetched_at DESC LIMIT 1",
        )
        .bind(runId, sourceId)
        .first<ScheduleSnapshot>(),
      db
        .prepare(
          `SELECT
             COUNT(*) AS item_count,
             SUM(CASE WHEN status IN ('failed','timed_out','skipped') THEN 1 ELSE 0 END) AS failure_count,
             MIN(started_at) AS started_at,
             MAX(completed_at) AS completed_at,
             SUM(bytes_fetched) AS bytes_fetched
           FROM icai_sync_items
           WHERE run_id=?1 AND source_id=?2`,
        )
        .bind(runId, sourceId)
        .first<ItemMetrics>(),
    ]);

    const failedItems = Number(metrics?.failure_count ?? 0);
    const success = Boolean(snapshot) && failedItems === 0;
    await recordIcaiSourceScheduleResult(db, sourceId, {
      success,
      completedAt: snapshot?.fetched_at ?? metrics?.completed_at ?? new Date(),
      durationMs: durationMs(
        metrics?.started_at ?? null,
        metrics?.completed_at ?? null,
      ),
      responseBytes:
        snapshot?.content_length ?? metrics?.bytes_fetched ?? null,
      itemCount: snapshot?.parsed_item_count ?? metrics?.item_count ?? null,
    });
  }
}

export async function annotateIcaiScheduledRun(
  db: D1Database,
  runId: string,
  input: {
    sourceIds: string[];
    syncGroup: string | null;
    scheduleWindow: string | null;
  },
) {
  const row = await db
    .prepare("SELECT details FROM icai_sync_runs WHERE id=?1 LIMIT 1")
    .bind(runId)
    .first<{ details: string | null }>();
  let details: Record<string, unknown> = {};
  if (row?.details) {
    try {
      const parsed = JSON.parse(row.details) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        details = parsed as Record<string, unknown>;
      }
    } catch {
      details = {};
    }
  }
  details.source_ids = input.sourceIds;
  details.sync_group = input.syncGroup;
  details.schedule_window = input.scheduleWindow;
  await db
    .prepare("UPDATE icai_sync_runs SET details=?1 WHERE id=?2")
    .bind(JSON.stringify(details), runId)
    .run();
}
