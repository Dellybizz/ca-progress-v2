import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getResourceR2Bucket, RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { cleanText, nullableId, RESOURCE_MAX_BYTES, validateUploadFile } from "@/lib/resources/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(error: string, status: number, code: string) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(request: Request) {
  try {
    const identity = await optionalUser();
    if (!identity) return jsonError("Authentication required.", 401, "AUTH_REQUIRED");

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

    const supabase = await createServerSupabaseClient();
    const inserted = await supabase.rpc("phase7_create_uploaded_resource", {
      p_title: title,
      p_description: description,
      p_subject_id: subjectId,
      p_chapter_id: chapterId,
      p_original_filename: file.name,
      p_safe_filename: validated.safeFilename,
      p_storage_path: storagePath,
      p_mime_type: validated.mimeType,
      p_extension: validated.extension,
      p_size_bytes: validated.sizeBytes,
      p_visibility: visibility,
    });

    if (inserted.error || !inserted.data?.[0]) {
      await bucket.delete(storagePath).catch(() => undefined);
      return jsonError(inserted.error?.message || "Resource metadata could not be saved.", 400, "RESOURCE_METADATA_FAILED");
    }

    const row = inserted.data[0];
    return NextResponse.json({ id: row.id, status: row.moderation_status, storage: RESOURCE_R2_STORAGE_BUCKET }, { status: 201 });
  } catch (error) {
    console.error("phase7.resource_upload.unhandled", error instanceof Error ? error.message : "unknown");
    return jsonError("The upload service hit an unexpected server error. Please try again.", 500, "UPLOAD_SERVER_ERROR");
  }
}
