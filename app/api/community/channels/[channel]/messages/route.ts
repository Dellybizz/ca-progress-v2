import { NextResponse } from "next/server";
import { createCommunityMessage, getCommunityMessagePage } from "@/lib/community/service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Community request failed.";
  const status = /sign in|authentication/i.test(message) ? 401 : /denied|cannot write|blocked/i.test(message) ? 403 : /not found/i.test(message) ? 404 : /must be|duplicate|rate limit|only approved|unavailable/i.test(message) ? 400 : 409;
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const url = new URL(request.url);
  try {
    const page = await getCommunityMessagePage({ channelSlug: channel, cursor: url.searchParams.get("cursor"), query: url.searchParams.get("q") });
    return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const body = await request.json().catch(() => null) as { body?: unknown; replyToId?: unknown; resourceId?: unknown; mentionUserIds?: unknown } | null;
  if (!body || typeof body.body !== "string") return NextResponse.json({ error: "Message text is required." }, { status: 400 });
  const mentionUserIds = Array.isArray(body.mentionUserIds) && body.mentionUserIds.every((value) => typeof value === "string") ? body.mentionUserIds : [];
  try {
    const result = await createCommunityMessage({
      channelSlug: channel,
      body: body.body,
      replyToId: typeof body.replyToId === "string" ? body.replyToId : null,
      resourceId: typeof body.resourceId === "string" ? body.resourceId : null,
      mentionUserIds,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
