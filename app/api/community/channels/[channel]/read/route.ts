import { NextResponse } from "next/server";
import { markCommunityRead } from "@/lib/community/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const body = await request.json().catch(() => ({})) as { sequence?: unknown };
  const sequence = typeof body.sequence === "number" && Number.isSafeInteger(body.sequence) && body.sequence >= 0 ? body.sequence : null;
  try {
    const lastReadSequence = await markCommunityRead(channel, sequence);
    return NextResponse.json({ ok: true, lastReadSequence }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Read state could not be updated.";
    return NextResponse.json({ error: message }, { status: /sign in/i.test(message) ? 401 : /denied|not found/i.test(message) ? 403 : 409, headers: { "Cache-Control": "private, no-store" } });
  }
}
