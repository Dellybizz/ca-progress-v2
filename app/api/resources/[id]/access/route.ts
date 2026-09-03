import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createR2PresignedUrl } from "@/lib/resources/r2-presign";
import { RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const response = await supabase.from("uploaded_resources")
    .select("id,owner_user_id,visibility,moderation_status,storage_bucket,storage_path")
    .eq("id", id).maybeSingle();
  if (response.error || !response.data) return NextResponse.json({ error: "Resource not found or access denied." }, { status: 404 });
  const row = response.data;
  const allowed = row.owner_user_id === identity.id || (row.visibility === "shared" && row.moderation_status === "approved");
  if (!allowed) return NextResponse.json({ error: "Resource not found or access denied." }, { status: 404 });
  if (row.storage_bucket !== RESOURCE_R2_STORAGE_BUCKET) return NextResponse.json({ error: "This legacy resource is not stored in Cloudflare R2." }, { status: 409 });
  try {
    const signed = await createR2PresignedUrl({ key: row.storage_path, method: "GET", expiresInSeconds: 120 });
    return NextResponse.redirect(signed.url, { status: 307, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Signed R2 download is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
