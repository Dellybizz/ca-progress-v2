import { NextResponse } from "next/server";
import { getStudentContext } from "@/lib/academic/student-context";
import { getServerGuestId } from "@/lib/auth/guest-server";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid origin." }, 403);
  const context = await getStudentContext();
  if (!context.userId || context.mode === "guest") return json({ error: "Sign in before preserving guest data." }, 401);
  const guestId = await getServerGuestId();
  let input: { action?: string; guestId?: string; summary?: Record<string, number>; mutationIds?: string[]; conflictCount?: number };
  try { input = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (!guestId || input.guestId !== guestId) return json({ error: "This guest data does not belong to this browser." }, 403);
  const db = getD1RuntimeDatabase();
  let migration = await db.prepare("SELECT id,status FROM guest_account_migrations WHERE guest_id=?1 AND account_user_id=?2 LIMIT 1").bind(guestId, context.userId).first<{ id: string; status: string }>();
  if (input.action === "start") {
    const summary = input.summary ?? {};
    if (["snapshots", "mutations", "files", "duplicates", "conflicts"].some(key => !Number.isSafeInteger(summary[key] ?? 0) || (summary[key] ?? 0) < 0)) return json({ error: "Invalid migration summary." }, 400);
    if (!migration) {
      const id = crypto.randomUUID();
      await db.batch([
        db.prepare("INSERT INTO guest_account_migrations(id,guest_id,account_user_id,summary_json,conflict_count) VALUES(?1,?2,?3,?4,?5)").bind(id, guestId, context.userId, JSON.stringify(summary), summary.conflicts ?? 0),
        db.prepare("INSERT INTO guest_account_migration_audit(id,migration_id,event_type,detail_json) VALUES(?1,?2,'started',?3)").bind(crypto.randomUUID(), id, JSON.stringify(summary)),
      ]);
      migration = { id, status: "running" };
    } else if (migration.status !== "completed") {
      await db.prepare("INSERT INTO guest_account_migration_audit(id,migration_id,event_type,detail_json) VALUES(?1,?2,'resumed',?3)").bind(crypto.randomUUID(), migration.id, JSON.stringify(summary)).run();
    }
    return json({ migrationId: migration.id, status: migration.status });
  }
  if (!migration) return json({ error: "Start the guest migration first." }, 409);
  if (input.action === "register") {
    const ids = [...new Set(input.mutationIds ?? [])];
    if (ids.length > 100 || ids.some(id => !UUID.test(id))) return json({ error: "Invalid migration item batch." }, 400);
    if (ids.length) await db.batch(ids.map(id => db.prepare("INSERT OR IGNORE INTO guest_account_migration_items(migration_id,mutation_id) VALUES(?1,?2)").bind(migration!.id, id)));
    return json({ registered: ids.length });
  }
  if (input.action === "complete") {
    const conflictCount = Math.max(0, Math.min(1000, Number(input.conflictCount ?? 0)));
    const missing = await db.prepare(`SELECT COUNT(*) AS count FROM guest_account_migration_items i
      LEFT JOIN offline_mutation_receipts r ON r.user_id=?1 AND r.mutation_id=i.mutation_id
      WHERE i.migration_id=?2 AND r.mutation_id IS NULL`).bind(context.userId, migration.id).first<{ count: number }>();
    if (Number(missing?.count ?? 0) > 0 || conflictCount > 0) {
      await db.batch([
        db.prepare("UPDATE guest_account_migrations SET status='needs_review',conflict_count=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2 AND status<>'completed'").bind(conflictCount + Number(missing?.count ?? 0), migration.id),
        db.prepare("INSERT INTO guest_account_migration_audit(id,migration_id,event_type,detail_json) VALUES(?1,?2,'needs_review',?3)").bind(crypto.randomUUID(), migration.id, JSON.stringify({ conflictCount, missingReceipts: Number(missing?.count ?? 0) })),
      ]);
      return json({ error: "Some guest changes need review before cleanup.", missingReceipts: Number(missing?.count ?? 0) }, 409);
    }
    await db.batch([
      db.prepare("UPDATE guest_account_migrations SET status='completed',completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?1").bind(migration.id),
      db.prepare("INSERT INTO guest_account_migration_audit(id,migration_id,event_type,detail_json) SELECT ?1,?2,'completed',?3 WHERE NOT EXISTS (SELECT 1 FROM guest_account_migration_audit WHERE migration_id=?2 AND event_type='completed')").bind(crypto.randomUUID(), migration.id, JSON.stringify({ verified: true })),
    ]);
    return json({ completed: true, migrationId: migration.id });
  }
  return json({ error: "Unsupported migration action." }, 400);
}
