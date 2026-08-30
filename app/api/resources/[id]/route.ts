import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cleanText, nullableId, RESOURCE_BUCKET } from "@/lib/resources/validation";

export const dynamic = "force-dynamic";

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
  const response = await supabase.from("uploaded_resources").update({ title, description, subject_id: subjectId, chapter_id: chapterId, visibility })
    .eq("id", id).eq("owner_user_id", identity.id).select("id,moderation_status").maybeSingle();
  if (response.error) return NextResponse.json({ error: response.error.message }, { status: 400 });
  if (!response.data) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  return NextResponse.json({ id: response.data.id, status: response.data.moderation_status });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const found = await supabase.from("uploaded_resources").select("id,storage_bucket,storage_path").eq("id", id).eq("owner_user_id", identity.id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 400 });
  if (!found.data) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  if (found.data.storage_bucket !== RESOURCE_BUCKET) return NextResponse.json({ error: "Unexpected storage bucket." }, { status: 400 });
  const storage = await supabase.storage.from(RESOURCE_BUCKET).remove([found.data.storage_path]);
  if (storage.error) return NextResponse.json({ error: `File deletion failed: ${storage.error.message}` }, { status: 400 });
  const deleted = await supabase.from("uploaded_resources").delete().eq("id", id).eq("owner_user_id", identity.id);
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
