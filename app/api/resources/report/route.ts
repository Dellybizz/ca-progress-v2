import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { reportHotResource } from "@/lib/data/d1/hot-screens";
import { cleanText } from "@/lib/resources/validation";

const reasons = new Set(["spam", "misleading", "copyright", "unsafe", "other"]);

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const entityType = body.entityType === "note" || body.entityType === "upload" ? body.entityType : null;
  const entityId = typeof body.entityId === "string" ? body.entityId : "";
  const reason = typeof body.reason === "string" && reasons.has(body.reason) ? body.reason : null;
  const details = cleanText(body.details, 4000) || null;
  if (!entityType || !/^[0-9a-f-]{36}$/i.test(entityId) || !reason) return NextResponse.json({ error: "Invalid report request." }, { status: 400 });
  try {
    const result = await reportHotResource({ entityType, entityId, userId: identity.id, reason, details });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resource could not be reported." }, { status: 400 });
  }

}
