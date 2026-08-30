import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getResourceR2Bucket, RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { cleanText, nullableId, RESOURCE_MAX_BYTES, validateUploadFile } from "@/lib/resources/validation";
import { createAdminSupabaseClient, getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(error: string, status: number, code: string) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(request: Request) {
  try {
    const identity = await optionalUser();
    if (!identity) return jsonError("Authentication required.", 401, "AUTH_REQUIRED");

    const adminConfig = getSupabaseAdminRuntimeConfig();
    if (!adminConfig.configured) {
      return jsonError(
        "Resource metadata service is temporarily unavailable. The server-only Supabase credential is not configured.",
        503,
        "METADATA_SERVICE_NOT_CONFIGURED",
      );
    }

    let bucket;
    try { bucket = getResourceR2Bucket(); }
    catch {
      return jsonError("Cloudflare R2 file storage is temporarily unavailable. The Worker bucket binding is not configured.", 503, "R2_NOT_CONFIGURED");
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

    try {
      await bucket.put(storagePath, validated.bytes, {
        httpMetadata: {
          contentType: validated.mimeType,
          cacheControl: "private, no-store",
        },
        customMetadata: {
          ownerUserId: identity.id,
          originalFilename: validated.safeFilename,
        },
      });
    } catch (error) {
      console.error("phase7.r2_upload.failed", error instanceof Error ? error.message : "unknown");
      return jsonError("Cloudflare R2 could not store this file. Please try again.", 502, "R2_UPLOAD_FAILED");
    }

    const admin = createAdminSupabaseClient();
    const inserted = await admin.from("uploaded_resources").insert({
      owner_user_id: identity.id,
      title,
      description,
      subject_id: subjectId,
      chapter_id: chapterId,
      original_filename: file.name,
      safe_filename: validated.safeFilename,
      storage_bucket: RESOURCE_R2_STORAGE_BUCKET,
      storage_path: storagePath,
      mime_type: validated.mimeType,
      extension: validated.extension,
      size_bytes: validated.sizeBytes,
      visibility,
    }).select("id,moderation_status").single();

    if (inserted.error) {
      await bucket.delete(storagePath).catch(() => undefined);
      return jsonError(inserted.error.message, 400, "RESOURCE_METADATA_FAILED");
    }

    return NextResponse.json({ id: inserted.data.id, status: inserted.data.moderation_status, storage: RESOURCE_R2_STORAGE_BUCKET }, { status: 201 });
  } catch (error) {
    console.error("phase7.resource_upload.unhandled", error instanceof Error ? error.message : "unknown");
    return jsonError("The upload service hit an unexpected server error. Please try again.", 500, "UPLOAD_SERVER_ERROR");
  }
}
