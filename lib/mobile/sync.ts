import "server-only";
import { getD1RuntimeDatabase, type D1DatabaseLike } from "@/lib/data/d1/client";

export const SYNC_PAGE_LIMIT = 200;
export const SYNC_TOMBSTONE_RETENTION_DAYS = 45;
export const SYNC_CHANGE_RETENTION_DAYS = 60;
export const SYNC_DOMAINS = Object.freeze({
  "/api/progress": "progress",
  "/api/planner/tasks": "planner_task",
  "/api/planner/goals": "planner_goal",
  "/api/planner/revision-settings": "revision_settings",
  "/api/notes": "note",
  "/api/study/timer": "focus_session",
  "/api/study/reflection": "session_review",
} as const);

export type SyncDomain = typeof SYNC_DOMAINS[keyof typeof SYNC_DOMAINS];
export type SyncChange = { sequence: number; entity_type: string; entity_id: string; entity_version: number; operation: "upsert"|"delete"; payload_json: string|null; occurred_at: string };

export function decodeCursor(value: string | null) {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("INVALID_CURSOR");
  return parsed;
}

export function entityIdentity(url: keyof typeof SYNC_DOMAINS, body: Record<string, unknown>) {
  if (url === "/api/progress") return String(body.chapterId || "");
  if (url === "/api/planner/tasks") return String(body.action === "create" ? body.clientId : body.id || "");
  if (url === "/api/planner/goals") return String(body.action === "create" ? body.clientId : body.id || "");
  if (url === "/api/planner/revision-settings") return String(body.clientId || "revision-settings");
  if (url === "/api/notes") return String(body.id || body.clientId || "");
  if (url === "/api/study/reflection") return String(body.sessionId || "");
  return "timer";
}

export function syncJournalStatements(db: D1DatabaseLike, input: {
  userId: string; contextKey: string; mutationId: string; requestHash: string;
  url: keyof typeof SYNC_DOMAINS; body: Record<string, unknown>; responseJson: string; responseStatus: number;
}) {
  const entityType = SYNC_DOMAINS[input.url];
  const entityId = entityIdentity(input.url, input.body);
  const operation = input.body.action === "delete" ? "delete" : "upsert";
  const payload = operation === "delete" ? null : JSON.stringify(input.body);
  const versionSql = `COALESCE((SELECT entity_version+1 FROM mobile_sync_entities WHERE user_id=?1 AND academic_context_key=?2 AND entity_type=?3 AND entity_id=?4),1)`;
  return [
    db.prepare(`INSERT INTO mobile_sync_entities(user_id,academic_context_key,entity_type,entity_id,entity_version,payload_json,deleted_at,updated_at)
      VALUES(?1,?2,?3,?4,${versionSql},?5,CASE WHEN ?6='delete' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,academic_context_key,entity_type,entity_id) DO UPDATE SET entity_version=entity_version+1,payload_json=excluded.payload_json,deleted_at=excluded.deleted_at,updated_at=CURRENT_TIMESTAMP`)
      .bind(input.userId,input.contextKey,entityType,entityId,payload,operation),
    db.prepare(`INSERT INTO mobile_sync_changes(user_id,academic_context_key,entity_type,entity_id,entity_version,operation,payload_json)
      SELECT user_id,academic_context_key,entity_type,entity_id,entity_version,?5,payload_json FROM mobile_sync_entities
      WHERE user_id=?1 AND academic_context_key=?2 AND entity_type=?3 AND entity_id=?4`)
      .bind(input.userId,input.contextKey,entityType,entityId,operation),
    db.prepare(`INSERT INTO mobile_sync_mutation_receipts(user_id,mutation_id,academic_context_key,request_hash,response_json,response_status,entity_type,entity_id,entity_version)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,entity_version FROM mobile_sync_entities
      WHERE user_id=?1 AND academic_context_key=?3 AND entity_type=?7 AND entity_id=?8`)
      .bind(input.userId,input.mutationId,input.contextKey,input.requestHash,input.responseJson,input.responseStatus,entityType,entityId),
    db.prepare("DELETE FROM mobile_sync_changes WHERE occurred_at < datetime('now','-60 days')"),
    db.prepare("DELETE FROM mobile_sync_entities WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-45 days')"),
  ];
}

export async function readDelta(userId: string, contextKey: string, cursor: number, limit = SYNC_PAGE_LIMIT, db = getD1RuntimeDatabase()) {
  const bounded = Math.max(1, Math.min(SYNC_PAGE_LIMIT, limit));
  const rows = (await db.prepare(`SELECT sequence,entity_type,entity_id,entity_version,operation,payload_json,occurred_at
    FROM mobile_sync_changes WHERE user_id=?1 AND academic_context_key=?2 AND sequence>?3 ORDER BY sequence ASC LIMIT ?4`)
    .bind(userId,contextKey,cursor,bounded+1).all<SyncChange>()).results ?? [];
  const page = rows.slice(0,bounded);
  return { changes: page, cursor: String(page.at(-1)?.sequence ?? cursor), hasMore: rows.length > bounded };
}
