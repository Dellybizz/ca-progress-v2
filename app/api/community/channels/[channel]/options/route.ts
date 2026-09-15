import { NextResponse } from "next/server";
import { getCommunityComposerOptions } from "@/lib/community/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  try {
    const options = await getCommunityComposerOptions(channel);
    return NextResponse.json(options, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Composer options could not be loaded.";
    return NextResponse.json({ error: message }, { status: /sign in|access|unavailable/i.test(message) ? 403 : 409, headers: { "Cache-Control": "private, no-store" } });
  }
}
