import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getResourceR2Bucket, RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const response = await supabase
    .from("uploaded_resources")
    .select("id,owner_user_id,visibility,moderation_status,storage_bucket,storage_path,safe_filename,mime_type,size_bytes")
    .eq("id", id)
    .maybeSingle();

  if (response.error || !response.data) return NextResponse.json({ error: "Resource not found or access denied." }, { status: 404 });

  const row = response.data;
  const allowed = row.owner_user_id === identity.id || (row.visibility === "shared" && row.moderation_status === "approved");
  if (!allowed) return NextResponse.json({ error: "Resource not found or access denied." }, { status: 404 });
  if (row.storage_bucket !== RESOURCE_R2_STORAGE_BUCKET) {
    return NextResponse.json({ error: "This legacy resource is not stored in Cloudflare R2. Re-upload it to use the current storage backend." }, { status: 409 });
  }

  let bucket;
  try { bucket = getResourceR2Bucket(); }
  catch { return NextResponse.json({ error: "Cloudflare R2 file storage is not configured for this Worker." }, { status: 503 }); }

  const object = await bucket.get(row.storage_path);
  if (!object) return NextResponse.json({ error: "Stored file was not found." }, { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row.mime_type || headers.get("Content-Type") || "application/octet-stream");
  headers.set("Content-Length", String(object.size || Number(row.size_bytes)));
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.safe_filename)}`);

  return new Response(object.body, { status: 200, headers });
}
