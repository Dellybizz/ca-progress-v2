import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { deleteHotNote } from "@/lib/data/d1/hot-screens";
import { getHotD1Database } from "@/lib/data/d1/runtime";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const found = await getHotD1Database().prepare("SELECT id FROM notes WHERE id=?1 AND user_id=?2 LIMIT 1").bind(id, identity.id).first<{ id: string }>();
  if (!found) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  await deleteHotNote(id, identity.id);
  return NextResponse.json({ ok: true });
}
