import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { getHotD1Database } from "@/lib/data/d1/runtime";

const headers = { "Cache-Control": "private, no-store" };
async function userOr401() { return optionalUser(); }

export async function GET() {
  const user = await userOr401();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  const request = await getHotD1Database().prepare("SELECT id,status,requested_at,scheduled_for,cancelled_at,completed_at,retention_note FROM account_deletion_requests WHERE user_id=?1 ORDER BY requested_at DESC LIMIT 1").bind(user.id).first();
  return NextResponse.json({ request: request ?? null }, { headers });
}

export async function POST(request: Request) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ error: "Request origin rejected." }, { status: 403, headers }); }
  const user = await userOr401();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (body?.confirmation !== "DELETE MY ACCOUNT") return NextResponse.json({ error: "Type DELETE MY ACCOUNT to confirm." }, { status: 400, headers });
  const existing = await getHotD1Database().prepare("SELECT id FROM account_deletion_requests WHERE user_id=?1 AND status IN ('scheduled','processing') LIMIT 1").bind(user.id).first();
  if (existing) return NextResponse.json({ ok: true, alreadyScheduled: true }, { headers });
  const scheduledFor = new Date(Date.now() + 7 * 86400000).toISOString();
  await getHotD1Database().prepare("INSERT INTO account_deletion_requests(id,user_id,status,scheduled_for) VALUES(?1,?2,'scheduled',?3)").bind(crypto.randomUUID(), user.id, scheduledFor).run();
  return NextResponse.json({ ok: true, scheduledFor }, { headers });
}

export async function DELETE(request: Request) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ error: "Request origin rejected." }, { status: 403, headers }); }
  const user = await userOr401();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  await getHotD1Database().prepare("UPDATE account_deletion_requests SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP WHERE user_id=?1 AND status='scheduled'").bind(user.id).run();
  return NextResponse.json({ ok: true }, { headers });
}
