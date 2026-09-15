import { NextResponse } from "next/server";
import { adminTraceId, recordAdminAuditEvent } from "@/lib/admin/audit";
import { adminAuthorizationStatus, requireAdminCapability } from "@/lib/authorization/server";
import { moderateCommunity } from "@/lib/community/service";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  let actor;
  try { actor = await requireAdminCapability("community.moderate"); }
  catch (error) {
    const status = adminAuthorizationStatus(error) ?? 403;
    return NextResponse.json({ error: status === 401 ? "Authentication required." : "Community moderation access required." }, { status, headers: privateHeaders });
  }
  const body = await request.json().catch(() => null) as {
    action?: unknown; messageId?: unknown; reportId?: unknown; targetUserId?: unknown; channelId?: unknown; reason?: unknown; durationMinutes?: unknown;
  } | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Moderation action is required." }, { status: 400, headers: privateHeaders });
  try {
    const reason = typeof body.reason === "string" ? body.reason : null;
    const actionId = await moderateCommunity({
      action: body.action,
      messageId: typeof body.messageId === "string" ? body.messageId : null,
      reportId: typeof body.reportId === "string" ? body.reportId : null,
      targetUserId: typeof body.targetUserId === "string" ? body.targetUserId : null,
      channelId: typeof body.channelId === "string" ? body.channelId : null,
      reason,
      durationMinutes: typeof body.durationMinutes === "number" && Number.isInteger(body.durationMinutes) ? body.durationMinutes : null,
    });
    const targetId = typeof body.reportId === "string" ? body.reportId : typeof body.messageId === "string" ? body.messageId : typeof body.targetUserId === "string" ? body.targetUserId : null;
    await recordAdminAuditEvent({ actorUserId: actor.user.id, actorRole: actor.role, capability: "community.moderate", action: `community.${body.action}`, targetType: "community_moderation", targetId, reason, newValue: { actionId, durationMinutes: body.durationMinutes ?? null }, traceId: adminTraceId(request), reversible: body.action !== "remove_message" });
    return NextResponse.json({ ok: true, actionId }, { headers: privateHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Moderation action failed.";
    return NextResponse.json({ error: message }, { status: /authentication/i.test(message) ? 401 : /moderator|access|capability/i.test(message) ? 403 : 400, headers: privateHeaders });
  }
}
