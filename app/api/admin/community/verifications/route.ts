import { NextResponse } from "next/server";
import { adminTraceId, recordAdminAuditEvent } from "@/lib/admin/audit";
import { adminAuthorizationStatus, requireAdminCapability } from "@/lib/authorization/server";
import { getCommunityVerificationAdminModel, manageCommunityVerification } from "@/lib/community/phase7";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

async function verificationActor() {
  try { return { actor: await requireAdminCapability("community.verification.manage"), error: null }; }
  catch (error) {
    const status = adminAuthorizationStatus(error) ?? 403;
    return { actor: null, error: NextResponse.json({ error: status === 401 ? "Authentication required." : "Community verification management access required." }, { status, headers: privateHeaders }) };
  }
}

export async function GET() {
  const auth = await verificationActor();
  if (auth.error) return auth.error;
  try {
    const model = await getCommunityVerificationAdminModel();
    if (!model) return NextResponse.json({ error: "Community verification access required." }, { status: 403, headers: privateHeaders });
    return NextResponse.json(model, { headers: privateHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification data could not be loaded.";
    return NextResponse.json({ error: message }, { status: 400, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  const auth = await verificationActor();
  if (auth.error || !auth.actor) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || (body.action !== "grant" && body.action !== "revoke")) return NextResponse.json({ error: "Verification action must be grant or revoke." }, { status: 400, headers: privateHeaders });
  try {
    const reason = typeof body.reason === "string" ? body.reason : null;
    const result = await manageCommunityVerification({
      action: body.action,
      targetUserId: typeof body.targetUserId === "string" ? body.targetUserId : null,
      verificationId: typeof body.verificationId === "string" ? body.verificationId : null,
      badgeKind: typeof body.badgeKind === "string" ? body.badgeKind : null,
      badgeValue: typeof body.badgeValue === "string" ? body.badgeValue : null,
      evidenceSource: typeof body.evidenceSource === "string" ? body.evidenceSource : null,
      evidenceReference: typeof body.evidenceReference === "string" ? body.evidenceReference : null,
      reason,
    });
    await recordAdminAuditEvent({ actorUserId: auth.actor.user.id, actorRole: auth.actor.role, capability: "community.verification.manage", action: `community.verification.${body.action}`, targetType: "community_verification", targetId: typeof body.verificationId === "string" ? body.verificationId : typeof body.targetUserId === "string" ? body.targetUserId : null, reason, newValue: { action: body.action, badgeKind: typeof body.badgeKind === "string" ? body.badgeKind : null }, traceId: adminTraceId(request), reversible: true });
    return NextResponse.json({ ok: true, ...result }, { headers: privateHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification action failed.";
    const status = /authentication/i.test(message) ? 401 : /admin|owner|access|capability/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status, headers: privateHeaders });
  }
}
