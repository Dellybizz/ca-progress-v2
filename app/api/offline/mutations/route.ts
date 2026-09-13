import { OFFLINE_ENABLED } from "@/lib/offline/config";
import { entityKey } from "@/lib/offline/projection";
import { NextResponse } from "next/server";
import { getStudentContext } from "@/lib/academic/student-context";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { offlineTransaction } from "@/lib/offline/transaction-context";
import { stageOfflineWrites } from "@/lib/offline/atomic";
import { POST as progress } from "@/app/api/progress/route";
import { POST as tasks } from "@/app/api/planner/tasks/route";
import { POST as notes } from "@/app/api/notes/route";
import { POST as timer } from "@/app/api/study/timer/route";

export const dynamic = "force-dynamic";
const handlers = { "/api/progress": progress, "/api/planner/tasks": tasks, "/api/notes": notes, "/api/study/timer": timer };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Receipt = { request_hash: string; response_json: string; response_status: number };

export async function POST(request: Request) {
  if (!OFFLINE_ENABLED) return json({ error: "Offline synchronization is not enabled." }, 503);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid origin." }, 403);
  const context = await getStudentContext();
  if (context.mode !== "ready" || !context.userId) return json({ error: "Sign in to synchronize your study data." }, 401);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 350_000) return json({ error: "Offline edit is too large." }, 413);
  let input: { ownerId: string; contextKey: string; url: keyof typeof handlers; body: Record<string, unknown>; expected: Record<string, unknown> | null; predecessor?: string | null };
  try { input = JSON.parse(text); } catch { return json({ error: "Invalid request." }, 400); }
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!input || !UUID.test(key) || !Object.hasOwn(handlers, input.url) || !input.body || typeof input.body !== "object" || Array.isArray(input.body)) return json({ error: "Invalid offline edit." }, 400);
  if (input.ownerId !== context.userId) return json({ error: "This edit belongs to another account." }, 403);
  const db = getD1RuntimeDatabase();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), v => v.toString(16).padStart(2, "0")).join("");
  const receipt = () => db.prepare("SELECT request_hash,response_json,response_status FROM offline_mutation_receipts WHERE user_id=?1 AND mutation_id=?2").bind(context.userId, key).first<Receipt>();
  const replay = (row: Receipt) => row.request_hash === hash ? json(JSON.parse(row.response_json), row.response_status) : json({ error: "This edit ID was already used for different content." }, 409);
  try {
    const previous = await receipt();
    if (previous) return replay(previous);
    if (input.contextKey !== context.contextKey) return json({ error: "Your academic selection changed. Review this edit before synchronizing." }, 409);
    const body = input.body;
    let table: string, where: string, values: unknown[], columns: string[];
    if (input.url === "/api/progress") {
      if (body.action !== "set_stage") return json({ error: "Undo requires an online connection." }, 400);
      table = "chapter_progress"; where = "user_id=? AND chapter_id=?"; values = [context.userId, body.chapterId];
      columns = ["completed_at", "revision_1_at", "revision_2_at", "test_1_at", "test_2_at"];
    } else if (input.url === "/api/planner/tasks") {
      table = "tasks"; where = "user_id=? AND id=?"; values = [context.userId, body.action === "create" ? body.clientId : body.id];
      columns = ["title", "notes", "status", "subject_id", "chapter_id", "due_at", "estimated_minutes"];
    } else if (input.url === "/api/notes") {
      table = "notes"; where = "user_id=? AND id=?"; values = [context.userId, body.id || body.clientId];
      columns = ["title", "body_html", "subject_id", "chapter_id", "visibility", "updated_at"];
    } else {
      table = "study_timer_state"; where = "user_id=?"; values = [context.userId];
      columns = ["status", "started_at", "elapsed_seconds", "running_since", "paused_at", "last_interaction_at"];
    }
    if (values.some(value => typeof value !== "string" || !value)) return json({ error: "Missing edit identity." }, 400);
    const query = `SELECT json_object(${columns.map(c => `'${c}',${c}`).join(",")}) AS value FROM ${table} WHERE ${where} LIMIT 1`;
    const current = (await db.prepare(query).bind(...values).first<{ value: string }>())?.value ?? "null";
    const currentObject = JSON.parse(current);
    if (input.expected === undefined || (input.expected !== null && (typeof input.expected !== "object" || Array.isArray(input.expected)))) return json({ error: "Missing conflict baseline. Reopen the screen online." }, 409);
    const entity = entityKey(input.url, body);
    const predecessor = input.predecessor && UUID.test(input.predecessor)
      ? await db.prepare("SELECT entity_after_json FROM offline_mutation_receipts WHERE user_id=?1 AND mutation_id=?2 AND entity_key=?3").bind(context.userId, input.predecessor, entity).first<{entity_after_json: string}>()
      : null;
    if (input.predecessor && (!predecessor || predecessor.entity_after_json !== current)) return json({ error: "An earlier edit changed or has not synchronized. Review the pending edits." }, 409);
    const emptyProgress = input.url === "/api/progress" && currentObject === null && input.expected && Object.values(input.expected).every(v => v === null);
    if (!predecessor && !emptyProgress && (input.expected === null ? currentObject !== null : !currentObject || Object.entries(input.expected).some(([name, value]) => !columns.includes(name) || currentObject[name] !== value))) return json({ error: "This item changed on another device. Your edit has been kept for review." }, 409);
    if (input.expected && !Object.keys(input.expected).length) return json({ error: "Missing conflict baseline." }, 409);
    const staged = stageOfflineWrites(db);
    const afterCommit: Array<() => Promise<void>> = [];
    const response = await offlineTransaction.run({ db: staged.db, afterCommit, occurredAt: typeof body.offlineOccurredAt === "string" ? body.offlineOccurredAt : undefined }, () => handlers[input.url](new Request(new URL(input.url, request.url), {
      method: "POST", headers: { "Content-Type": "application/json", "X-Offline-Replay": "1" }, body: JSON.stringify(body),
    })));
    if (!response.ok) return response;
    const responseText = await response.text();
    const insert = db.prepare(`INSERT INTO offline_mutation_receipts(user_id,mutation_id,request_hash,response_json,response_status,entity_key,guard_ok)
      VALUES (?,?,?,?,?,?,CASE WHEN COALESCE((${query}),'null')=? THEN 1 ELSE 0 END)`)
      .bind(context.userId, key, hash, responseText, response.status, entity, ...values, current);
    // Uniqueness or a concurrent entity edit aborts the entire batch, including domain events.
    await db.batch([insert, ...staged.writes,
      db.prepare(`UPDATE offline_mutation_receipts SET entity_after_json=COALESCE((${query}),'null'),response_json=json_set(response_json,'$._offlineBaseline',json(COALESCE((${query}),'null'))) WHERE user_id=? AND mutation_id=?`).bind(...values, ...values, context.userId, key),
    ]);
    for (const callback of afterCommit) await callback();
    return replay((await receipt())!);
  } catch (error) {
    const previous = await receipt().catch(() => null);
    if (previous) return replay(previous);
    if (/guard_ok|CHECK constraint/i.test(String(error))) return json({ error: "This item changed while synchronizing. Review your saved edit." }, 409);
    return json({ error: "Synchronization is temporarily unavailable. Your edit remains on this device." }, 503);
  }
}
