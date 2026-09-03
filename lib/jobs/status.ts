import "server-only";

import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";

export async function getBackgroundJobStatus(limit = 100) {
  const safeLimit = Math.max(1, Math.min(200, Math.round(limit)));
  const database: HotD1Database = getHotD1Database();
  const result = await database.prepare(
    "SELECT id,idempotency_key,job_type,status,attempts,max_attempts,last_error,created_by,created_at,started_at,finished_at,updated_at FROM background_jobs ORDER BY updated_at DESC LIMIT ?1"
  ).bind(safeLimit).all();
  return (result.results ?? []) as Array<Record<string, unknown>>;
}

export async function getOpenDeadLetters(limit = 50) {
  const safeLimit = Math.max(1, Math.min(100, Math.round(limit)));
  const result = await database.prepare(
    "SELECT id,job_id,idempotency_key,job_type,attempts,error,created_at FROM background_job_dead_letters WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT ?1"
  ).bind(safeLimit).all();
  return (result.results ?? []) as Array<Record<string, unknown>>;
}
