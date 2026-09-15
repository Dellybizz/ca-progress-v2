import { NextResponse } from "next/server";
import { adminTraceId, recordAdminAuditEvent } from "@/lib/admin/audit";
import { adminAuthorizationStatus, requireAdminCapability } from "@/lib/authorization/server";
import { moderateHotResource } from "@/lib/data/d1/hot-screens";
import { cleanText } from "@/lib/resources/validation";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  let actor;
  try { actor = await requireAdminCapability("resources.moderate"); }
  catch (error) {
    const status = adminAuthorizationStatus(error) ?? 403;
    return NextResponse.json({ error: status === 401 ? "Authentication required." : "Resource moderation access required." }, { status, headers: privateHeaders });
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: privateHeaders }); }
  const entityType = body.entityType === "note" || body.entityType === "upload" ? body.entityType : null;
  const entityId = typeof body.entityId === "string" ? body.entityId : "";
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  const notes = cleanText(body.notes, 4000) || null;
  if (!entityType || !/^[0-9a-f-]{36}$/i.test(entityId) || !decision) return NextResponse.json({ error: "Invalid moderation request." }, { status: 400, headers: privateHeaders });
  try {
    const result = await moderateHotResource({ entityType, entityId, actorUserId: actor.user.id, decision, notes });
    await recordAdminAuditEvent({ actorUserId: actor.user.id, actorRole: actor.role, capability: "resources.moderate", action: `resources.${decision}`, targetType: entityType === "note" ? "note" : "uploaded_resource", targetId: entityId, reason: notes, newValue: { moderationDecision: decision }, traceId: adminTraceId(request), reversible: true });
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resource moderation failed." }, { status: 400, headers: privateHeaders });
  }
}
