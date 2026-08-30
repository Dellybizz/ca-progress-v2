import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getSupabaseAdminConfig } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { cleanText, nullableId, RESOURCE_BUCKET, RESOURCE_MAX_BYTES, validateUploadFile } from "@/lib/resources/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(error: string, status: number, code: string) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(request: Request) {
  try {
    const identity = await optionalUser();
    if (!identity) return jsonError("Authentication required.", 401, "AUTH_REQUIRED");

    const adminConfig = getSupabaseAdminConfig();
    if (!adminConfig.configured) {
      return jsonError("Secure file storage is temporarily unavailable. The server storage credential is not configured.", 503, "STORAGE_NOT_CONFIGURED");
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > RESOURCE_MAX_BYTES + 1024 * 1024) {
      return jsonError("Upload request is larger than the 10 MB Phase 7 file limit.", 413, "UPLOAD_TOO_LARGE");
    }

    let form: FormData;
    try { form = await request.formData(); }
    catch { return jsonError("Invalid multipart upload.", 400, "INVALID_MULTIPART"); }

    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("Choose a file to upload.", 400, "FILE_REQUIRED");

    let validated;
    try { validated = await validateUploadFile(file); }
    catch (error) {
      return jsonError(error instanceof Error ? error.message : "Upload validation failed.", 400, "UPLOAD_VALIDATION_FAILED");
    }

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
    if (upload.error) return jsonError(`File storage failed: ${upload.error.message}`, 400, "STORAGE_UPLOAD_FAILED");

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
      return jsonError(inserted.error.message, 400, "RESOURCE_METADATA_FAILED");
    }

    return NextResponse.json({ id: inserted.data.id, status: inserted.data.moderation_status }, { status: 201 });
  } catch (error) {
    console.error("phase7.resource_upload.unhandled", error instanceof Error ? error.message : "unknown");
    return jsonError("The upload service hit an unexpected server error. Please try again.", 500, "UPLOAD_SERVER_ERROR");
  }
}
