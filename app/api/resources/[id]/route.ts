import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getResourceR2Bucket, RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { cleanText, nullableId } from "@/lib/resources/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const title = cleanText(body.title, 160);
  if (!title) return NextResponse.json({ error: "A resource title is required." }, { status: 400 });
  const description = cleanText(body.description, 4000) || null;
  const subjectId = nullableId(body.subjectId);
  const chapterId = nullableId(body.chapterId);
  const visibility = body.visibility === "shared" ? "shared" : "private";

  const supabase = await createServerSupabaseClient();
  const found = await supabase.from("uploaded_resources").select("id,owner_user_id").eq("id", id).eq("owner_user_id", identity.id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 400 });
  if (!found.data) return NextResponse.json({ error: "Resource not found." }, { status: 404 });

  const response = await supabase.rpc("phase7_update_uploaded_resource", {
    p_resource_id: id,
    p_title: title,
    p_description: description,
    p_subject_id: subjectId,
    p_chapter_id: chapterId,
    p_visibility: visibility,
  });
  if (response.error) return NextResponse.json({ error: response.error.message }, { status: 400 });
  return NextResponse.json({ id, status: response.data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const found = await supabase.from("uploaded_resources").select("id,owner_user_id,storage_bucket,storage_path").eq("id", id).eq("owner_user_id", identity.id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 400 });
  if (!found.data) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  if (found.data.storage_bucket !== RESOURCE_R2_STORAGE_BUCKET) {
    return NextResponse.json({ error: "This legacy resource is not stored in Cloudflare R2. Re-upload it before deleting through the current storage backend." }, { status: 409 });
  }

  let bucket;
  try { bucket = getResourceR2Bucket(); }
  catch { return NextResponse.json({ error: "Cloudflare R2 file storage is not configured for this Worker." }, { status: 503 }); }

  try { await bucket.delete(found.data.storage_path); }
  catch (error) {
    console.error("phase7.r2_delete.failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Cloudflare R2 could not delete this file." }, { status: 502 });
  }

  const deleted = await supabase.rpc("phase7_delete_uploaded_resource", { p_resource_id: id });
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
