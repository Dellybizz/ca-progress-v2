import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getResourceR2Bucket, RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { cleanText, nullableId } from "@/lib/resources/validation";
import { createAdminSupabaseClient, getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";
import { createServerSupabaseClient, isCloudflareDataRuntime } from "@/lib/supabase/server";
import { deleteHotResource, getHotOwnedResource, patchHotResource } from "@/lib/data/d1/hot-screens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function metadataUnavailable() {
  return NextResponse.json({ error: "Resource metadata service is temporarily unavailable." }, { status: 503 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isCloudflareDataRuntime() && !getSupabaseAdminRuntimeConfig().configured) return metadataUnavailable();

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

  if (isCloudflareDataRuntime()) {
    try {
      const result = await patchHotResource({ id, userId: identity.id, title, description, subjectId, chapterId, visibility });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Resource could not be updated." }, { status: 400 });
    }
  }
  const supabase = await createServerSupabaseClient();
  const found = await supabase.from("uploaded_resources").select("id,owner_user_id").eq("id", id).eq("owner_user_id", identity.id).maybeSingle();
  if (found.error) return NextResponse.json({ error: found.error.message }, { status: 400 });
  if (!found.data) return NextResponse.json({ error: "Resource not found." }, { status: 404 });

  const admin = createAdminSupabaseClient();
  const response = await admin.from("uploaded_resources")
    .update({ title, description, subject_id: subjectId, chapter_id: chapterId, visibility })
    .eq("id", id)
    .eq("owner_user_id", identity.id)
    .select("id,moderation_status")
    .single();

  if (response.error) return NextResponse.json({ error: response.error.message }, { status: 400 });
  return NextResponse.json({ id: response.data.id, status: response.data.moderation_status });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!getSupabaseAdminRuntimeConfig().configured) return metadataUnavailable();

  const { id } = await params;
  if (isCloudflareDataRuntime()) {
    const found = await getHotOwnedResource(id, identity.id);
    if (!found) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    if (found.storage_bucket !== RESOURCE_R2_STORAGE_BUCKET) return NextResponse.json({ error: "This resource is not stored in the current R2 bucket." }, { status: 409 });
    let bucket;
    try { bucket = getResourceR2Bucket(); } catch { return NextResponse.json({ error: "Cloudflare R2 file storage is not configured." }, { status: 503 }); }
    try { await bucket.delete(found.storage_path); } catch { return NextResponse.json({ error: "Cloudflare R2 could not delete this file." }, { status: 502 }); }
    await deleteHotResource(id, identity.id);
    return NextResponse.json({ ok: true });
  }
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

  const admin = createAdminSupabaseClient();
  const deleted = await admin.from("uploaded_resources").delete().eq("id", id).eq("owner_user_id", identity.id);
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
