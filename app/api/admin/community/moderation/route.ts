import { NextResponse } from "next/server";
import { moderateCommunity } from "@/lib/community/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    action?: unknown;
    messageId?: unknown;
    reportId?: unknown;
    targetUserId?: unknown;
    channelId?: unknown;
    reason?: unknown;
    durationMinutes?: unknown;
  } | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Moderation action is required." }, { status: 400 });
  try {
    const actionId = await moderateCommunity({
      action: body.action,
      messageId: typeof body.messageId === "string" ? body.messageId : null,
      reportId: typeof body.reportId === "string" ? body.reportId : null,
      targetUserId: typeof body.targetUserId === "string" ? body.targetUserId : null,
      channelId: typeof body.channelId === "string" ? body.channelId : null,
      reason: typeof body.reason === "string" ? body.reason : null,
      durationMinutes: typeof body.durationMinutes === "number" && Number.isInteger(body.durationMinutes) ? body.durationMinutes : null,
    });
    return NextResponse.json({ ok: true, actionId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Moderation action failed.";
    return NextResponse.json({ error: message }, { status: /authentication/i.test(message) ? 401 : /moderator|access/i.test(message) ? 403 : 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
