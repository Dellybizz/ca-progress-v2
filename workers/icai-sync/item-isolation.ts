import type { D1Database } from "./d1-client";

export type IcaiItemTerminalStatus = "succeeded" | "failed" | "timed_out" | "skipped";
export type IcaiItemResult = {
  itemUrl: string;
  status: IcaiItemTerminalStatus;
  stage: string;
  bytesFetched?: number;
  parsedCount?: number;
  failureCategory?: string | null;
  failureMessage?: string | null;
  skipReason?: string | null;
  retryEligible?: boolean;
};

export async function beginIcaiItemExecution(
  db: D1Database,
  runId: string,
  sourceId: string,
  itemUrl: string,
  itemTitle: string | null,
  itemType = "nested_page",
) {
  const id = crypto.randomUUID();
  const row = await db.prepare(
    "INSERT INTO icai_sync_items(id,run_id,source_id,item_url,item_type,item_title,status,stage,attempts,started_at,completed_at,duration_ms,bytes_fetched,parsed_count,failure_category,failure_message,skip_reason,retry_eligible,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,'running','fetching',1,CURRENT_TIMESTAMP,NULL,NULL,0,0,NULL,NULL,NULL,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(run_id,source_id,item_url) DO UPDATE SET item_type=excluded.item_type,item_title=excluded.item_title,status='running',stage='fetching',attempts=MIN(icai_sync_items.attempts+1,20),started_at=CURRENT_TIMESTAMP,completed_at=NULL,duration_ms=NULL,bytes_fetched=0,parsed_count=0,failure_category=NULL,failure_message=NULL,skip_reason=NULL,retry_eligible=0,updated_at=CURRENT_TIMESTAMP RETURNING id",
  ).bind(id, runId, sourceId, itemUrl, itemType, itemTitle).first<{ id: string }>();
  const itemId = row?.id ?? id;
  await db.prepare("UPDATE icai_sync_runtime SET current_item_id=?1,current_item_url=?2,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE run_id=?3")
    .bind(itemId, itemUrl, runId).run();
  return itemId;
}

export async function finishIcaiItemExecution(
  db: D1Database,
  runId: string,
  sourceId: string,
  result: IcaiItemResult,
) {
  await db.prepare(
    "UPDATE icai_sync_items SET status=?1,stage=?2,completed_at=CURRENT_TIMESTAMP,duration_ms=CASE WHEN started_at IS NULL THEN NULL ELSE MAX(0,CAST((julianday(CURRENT_TIMESTAMP)-julianday(started_at))*86400000 AS INTEGER)) END,bytes_fetched=?3,parsed_count=?4,failure_category=?5,failure_message=?6,skip_reason=?7,retry_eligible=?8,updated_at=CURRENT_TIMESTAMP WHERE run_id=?9 AND source_id=?10 AND item_url=?11",
  ).bind(
    result.status,
    result.stage,
    Math.max(0, Math.floor(result.bytesFetched ?? 0)),
    Math.max(0, Math.floor(result.parsedCount ?? 0)),
    result.failureCategory ?? null,
    result.failureMessage?.slice(0, 1000) ?? null,
    result.skipReason?.slice(0, 500) ?? null,
    result.retryEligible ? 1 : 0,
    runId,
    sourceId,
    result.itemUrl,
  ).run();
  await db.prepare("UPDATE icai_sync_runtime SET current_item_id=NULL,current_item_url=NULL,heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE run_id=?1 AND current_item_url=?2")
    .bind(runId, result.itemUrl).run();
}
