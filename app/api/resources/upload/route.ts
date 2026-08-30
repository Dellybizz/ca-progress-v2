import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createResourceMetadataWithinQuota, getResourceStorageAccess } from "@/lib/billing/service";
import { getResourceR2Bucket, RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { cleanText, nullableId, RESOURCE_MAX_BYTES, validateUploadFile } from "@/lib/resources/validation";
import { getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(error: string, status: number, code: string, details?: Record<string, unknown>) {
  return NextResponse.json({ error, code, ...details }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
    const identity = await optionalUser();
    if (!identity) return jsonError("Authentication required.", 401, "AUTH_REQUIRED");
    const adminConfig = getSupabaseAdminRuntimeConfig();
    if (!adminConfig.configured) return jsonError("Resource metadata service is temporarily unavailable. The server-only Supabase credential is not configured.", 503, "METADATA_SERVICE_NOT_CONFIGURED");

    let bucket;
    try { bucket = getResourceR2Bucket(); }
    catch { return jsonError("Cloudflare R2 file storage is temporarily unavailable. The Worker bucket binding is not configured.", 503, "R2_NOT_CONFIGURED"); }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > RESOURCE_MAX_BYTES + 1024 * 1024) return jsonError("Upload request is larger than the 10 MB per-file limit.", 413, "UPLOAD_TOO_LARGE");
    let form: FormData;
    try { form = await request.formData(); } catch { return jsonError("Invalid multipart upload.", 400, "INVALID_MULTIPART"); }
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("Choose a file to upload.", 400, "FILE_REQUIRED");

    let validated;
    try { validated = await validateUploadFile(file); } catch (error) { return jsonError(error instanceof Error ? error.message : "Upload validation failed.", 400, "UPLOAD_VALIDATION_FAILED"); }

    const access = await getResourceStorageAccess(identity.id);
    if (!access.allowed) return jsonError(access.upgradeMessage || "Your current plan does not allow file storage.", 403, "ENTITLEMENT_REQUIRED", { feature: "resources.storage", plan: access.tier });
    if (access.limitBytes !== null && access.usedBytes + validated.sizeBytes > access.limitBytes) return jsonError(access.upgradeMessage || "Your plan storage allowance has been reached.", 403, "STORAGE_LIMIT_REACHED", { feature: "resources.storage", plan: access.tier, usedBytes: access.usedBytes, limitBytes: access.limitBytes, requestedBytes: validated.sizeBytes });

    const title = cleanText(form.get("title"), 160) || validated.safeFilename.replace(/\.[^.]+$/, "");
    const description = cleanText(form.get("description"), 4000) || null;
    const subjectId = nullableId(form.get("subjectId"));
    const chapterId = nullableId(form.get("chapterId"));
    const visibility = form.get("visibility") === "shared" ? "shared" as const : "private" as const;
    const storagePath = `${identity.id}/${crypto.randomUUID()}/${validated.safeFilename}`;

    try {
      await bucket.put(storagePath, validated.bytes, { httpMetadata: { contentType: validated.mimeType, cacheControl: "private, no-store" }, customMetadata: { ownerUserId: identity.id, originalFilename: validated.safeFilename } });
    } catch (error) {
      console.error("phase7.r2_upload.failed", error instanceof Error ? error.message : "unknown");
      return jsonError("Cloudflare R2 could not store this file. Please try again.", 502, "R2_UPLOAD_FAILED");
    }

    try {
      const inserted = await createResourceMetadataWithinQuota({ userId: identity.id, title, description, subjectId, chapterId, originalFilename: file.name, safeFilename: validated.safeFilename, storagePath, mimeType: validated.mimeType, extension: validated.extension, sizeBytes: validated.sizeBytes, visibility });
      return NextResponse.json({ id: inserted.id, status: inserted.moderationStatus, storage: RESOURCE_R2_STORAGE_BUCKET, allowance: { usedBytes: inserted.usedBytes, limitBytes: inserted.limitBytes, plan: access.tier } }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      await bucket.delete(storagePath).catch(() => undefined);
      const message = error instanceof Error ? error.message : "Resource metadata could not be created.";
      if (/allowance exceeded|entitlement required/i.test(message)) return jsonError(access.upgradeMessage || "Your plan storage allowance has been reached.", 403, "STORAGE_LIMIT_REACHED", { feature: "resources.storage", plan: access.tier });
      return jsonError(message, 400, "RESOURCE_METADATA_FAILED");
    }
  } catch (error) {
    console.error("phase7.resource_upload.unhandled", error instanceof Error ? error.message : "unknown");
    return jsonError("The upload service hit an unexpected server error. Please try again.", 500, "UPLOAD_SERVER_ERROR");
  }
}
