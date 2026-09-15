import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getOwnedPhase6NoteExport } from "@/lib/notes/phase6";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const payload = await getOwnedPhase6NoteExport(identity.id, id);
  if (!payload) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  const title = typeof payload.note.title === "string" ? payload.note.title : "revision-note";
  const filename = title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "revision-note";
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
