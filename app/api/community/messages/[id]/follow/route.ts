import { NextResponse } from "next/server";
import { toggleCommunityFollowFromMessage } from "@/lib/community/phase7";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await toggleCommunityFollowFromMessage(id);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Community follow failed.";
    const status = /sign in/i.test(message) ? 401 : /denied/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
