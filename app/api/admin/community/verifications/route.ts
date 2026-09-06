import { NextResponse } from "next/server";
import { getCommunityVerificationAdminModel, manageCommunityVerification } from "@/lib/community/phase7";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const model = await getCommunityVerificationAdminModel();
    if (!model) return NextResponse.json({ error: "Community verification access required." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json(model, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification data could not be loaded.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || (body.action !== "grant" && body.action !== "revoke")) return NextResponse.json({ error: "Verification action must be grant or revoke." }, { status: 400 });
  try {
    const result = await manageCommunityVerification({
      action: body.action,
      targetUserId: typeof body.targetUserId === "string" ? body.targetUserId : null,
      verificationId: typeof body.verificationId === "string" ? body.verificationId : null,
      badgeKind: typeof body.badgeKind === "string" ? body.badgeKind : null,
      badgeValue: typeof body.badgeValue === "string" ? body.badgeValue : null,
      evidenceSource: typeof body.evidenceSource === "string" ? body.evidenceSource : null,
      evidenceReference: typeof body.evidenceReference === "string" ? body.evidenceReference : null,
      reason: typeof body.reason === "string" ? body.reason : null,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification action failed.";
    const status = /authentication/i.test(message) ? 401 : /admin|owner|access/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
