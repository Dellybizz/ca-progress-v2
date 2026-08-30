import { NextResponse } from "next/server";
import { toggleCommunityReaction } from "@/lib/community/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as { emoji?: unknown } | null;
  if (!body || typeof body.emoji !== "string") return NextResponse.json({ error: "Reaction is required." }, { status: 400 });
  try {
    const active = await toggleCommunityReaction(id, body.emoji);
    return NextResponse.json({ ok: true, active }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reaction could not be updated.";
    return NextResponse.json({ error: message }, { status: /sign in/i.test(message) ? 401 : /denied/i.test(message) ? 403 : 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
