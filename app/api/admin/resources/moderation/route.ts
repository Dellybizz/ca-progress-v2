import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getServerAppRole } from "@/lib/authorization/server";
import { isPrivilegedRole } from "@/lib/authorization/roles";
import { moderateHotResource } from "@/lib/data/d1/hot-screens";
import { cleanText } from "@/lib/resources/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const role = await getServerAppRole();
  if (!isPrivilegedRole(role)) return NextResponse.json({ error: "Moderator access required." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const entityType = body.entityType === "note" || body.entityType === "upload" ? body.entityType : null;
  const entityId = typeof body.entityId === "string" ? body.entityId : "";
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  const notes = cleanText(body.notes, 4000) || null;
  if (!entityType || !/^[0-9a-f-]{36}$/i.test(entityId) || !decision) return NextResponse.json({ error: "Invalid moderation request." }, { status: 400 });
  try {
    const result = await moderateHotResource({ entityType, entityId, actorUserId: identity.id, decision, notes });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resource moderation failed." }, { status: 400 });
  }

}
