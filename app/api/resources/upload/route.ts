import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { cleanText, nullableId, RESOURCE_BUCKET, RESOURCE_MAX_BYTES, validateUploadFile } from "@/lib/resources/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > RESOURCE_MAX_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "Upload request is larger than the 10 MB Phase 7 file limit." }, { status: 413 });
  }

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: "Invalid multipart upload." }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });

  let validated;
  try { validated = await validateUploadFile(file); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Upload validation failed." }, { status: 400 }); }

  const title = cleanText(form.get("title"), 160) || validated.safeFilename.replace(/\.[^.]+$/, "");
  const description = cleanText(form.get("description"), 4000) || null;
  const subjectId = nullableId(form.get("subjectId"));
  const chapterId = nullableId(form.get("chapterId"));
  const visibility = form.get("visibility") === "shared" ? "shared" : "private";
  const storagePath = `${identity.id}/${crypto.randomUUID()}/${validated.safeFilename}`;
  const admin = createAdminSupabaseClient();

  const upload = await admin.storage.from(RESOURCE_BUCKET).upload(storagePath, validated.bytes, {
    contentType: validated.mimeType,
    cacheControl: "private, max-age=0",
    upsert: false,
  });
  if (upload.error) return NextResponse.json({ error: `File storage failed: ${upload.error.message}` }, { status: 400 });

  const inserted = await admin.from("uploaded_resources").insert({
    owner_user_id: identity.id,
    title,
    description,
    subject_id: subjectId,
    chapter_id: chapterId,
    original_filename: file.name,
    safe_filename: validated.safeFilename,
    storage_bucket: RESOURCE_BUCKET,
    storage_path: storagePath,
    mime_type: validated.mimeType,
    extension: validated.extension,
    size_bytes: validated.sizeBytes,
    visibility,
  }).select("id,moderation_status").single();

  if (inserted.error) {
    await admin.storage.from(RESOURCE_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: inserted.error.message }, { status: 400 });
  }

  return NextResponse.json({ id: inserted.data.id, status: inserted.data.moderation_status }, { status: 201 });
}
