import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
  const supabase = await createServerSupabaseClient();
  const response = await supabase.rpc("phase7_report_resource", { p_entity_type: entityType, p_entity_id: entityId, p_reason: reason, p_details: details });
  if (response.error) return NextResponse.json({ error: response.error.message }, { status: 400 });
  return NextResponse.json({ id: response.data, status: "reported" }, { status: 201 });
}
