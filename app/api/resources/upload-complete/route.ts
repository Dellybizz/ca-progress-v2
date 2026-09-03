import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getResourceStorageAccess, createResourceMetadataWithinQuota } from "@/lib/billing/service";
import { getResourceR2Bucket, RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";
import { getHotD1Database } from "@/lib/data/d1/runtime";
import { enqueueBackgroundJob, jobKey } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return fail("Authentication required.", 401, "AUTH_REQUIRED");
  if (!getSupabaseAdminRuntimeConfig().configured) return fail("Resource metadata service is unavailable.", 503, "METADATA_SERVICE_NOT_CONFIGURED");
  const body = await request.json().catch(() => null) as { uploadId?: unknown } | null;
  const uploadId = typeof body?.uploadId === "string" ? body.uploadId : "";
  if (!uploadId) return fail("Upload id is required.", 400, "UPLOAD_ID_REQUIRED");

  const database = getHotD1Database() as any;
  const intent = await database.prepare("SELECT id,user_id,object_key,filename,mime_type,expected_size_bytes,metadata_json,expires_at,status FROM r2_upload_intents WHERE id=?1 LIMIT 1").bind(uploadId).first() as Record<string, unknown> | null;
  if (!intent || intent.user_id !== identity.id) return fail("Upload not found.", 404, "UPLOAD_NOT_FOUND");
  if (intent.status !== "issued") return fail("This upload has already been completed or closed.", 409, "UPLOAD_NOT_ACTIVE");
  if (Date.parse(String(intent.expires_at)) <= Date.now()) {
    await database.prepare("UPDATE r2_upload_intents SET status='abandoned' WHERE id=?1").bind(uploadId).run();
    return fail("The upload URL expired. Start the upload again.", 410, "UPLOAD_EXPIRED");
  }

  let bucket;
  try { bucket = getResourceR2Bucket(); } catch { return fail("R2 storage is unavailable.", 503, "R2_NOT_CONFIGURED"); }
  const object = await bucket.head(String(intent.object_key));
  if (!object) return fail("The direct upload was not found in R2.", 404, "OBJECT_NOT_FOUND");
  if (Number(object.size) !== Number(intent.expected_size_bytes)) {
    await bucket.delete(String(intent.object_key)).catch(() => undefined);
    await database.prepare("UPDATE r2_upload_intents SET status='failed' WHERE id=?1").bind(uploadId).run();
    return fail("Uploaded file size does not match the issued descriptor.", 400, "OBJECT_SIZE_MISMATCH");
  }
  const actualMime = String(object.httpMetadata?.contentType ?? "").toLowerCase();
  if (actualMime !== String(intent.mime_type).toLowerCase()) {
    await bucket.delete(String(intent.object_key)).catch(() => undefined);
    await database.prepare("UPDATE r2_upload_intents SET status='failed' WHERE id=?1").bind(uploadId).run();
    return fail("Uploaded file MIME type does not match the issued descriptor.", 400, "OBJECT_MIME_MISMATCH");
  }

  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(String(intent.metadata_json)) as Record<string, unknown>; } catch { /* safe defaults */ }
  const access = await getResourceStorageAccess(identity.id);
  if (!access.allowed || (access.limitBytes !== null && access.usedBytes + Number(intent.expected_size_bytes) > access.limitBytes)) {
    await bucket.delete(String(intent.object_key)).catch(() => undefined);
    await database.prepare("UPDATE r2_upload_intents SET status='failed' WHERE id=?1").bind(uploadId).run();
    return fail(access.upgradeMessage || "Your storage allowance has changed.", 403, "STORAGE_LIMIT_REACHED");
  }

  try {
    const inserted = await createResourceMetadataWithinQuota({
      userId: identity.id,
      title: typeof metadata.title === "string" && metadata.title.trim() ? metadata.title.trim().slice(0, 160) : String(intent.filename).replace(/\.[^.]+$/, ""),
      description: typeof metadata.description === "string" ? metadata.description.trim().slice(0, 4000) || null : null,
      subjectId: typeof metadata.subjectId === "string" ? metadata.subjectId : null,
      chapterId: typeof metadata.chapterId === "string" ? metadata.chapterId : null,
      originalFilename: String(intent.filename),
      safeFilename: String(intent.filename),
      storagePath: String(intent.object_key),
      mimeType: String(intent.mime_type),
      extension: String(intent.filename).split(".").pop()?.toLowerCase() || "bin",
      sizeBytes: Number(intent.expected_size_bytes),
      visibility: metadata.visibility === "shared" ? "shared" : "private",
    });
    await database.prepare("UPDATE r2_upload_intents SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?1").bind(uploadId).run();
    void enqueueBackgroundJob({ type: "attachment-process", idempotencyKey: jobKey("attachment-process", identity.id, String(inserted.id)), payload: { resourceId: inserted.id, userId: identity.id }, createdBy: identity.id }).catch(() => undefined);
    return NextResponse.json({ id: inserted.id, status: inserted.moderationStatus, storage: RESOURCE_R2_STORAGE_BUCKET, processing: "queued" }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    await bucket.delete(String(intent.object_key)).catch(() => undefined);
    await database.prepare("UPDATE r2_upload_intents SET status='failed' WHERE id=?1").bind(uploadId).run();
    return fail(error instanceof Error ? error.message : "Resource metadata could not be created.", 400, "RESOURCE_METADATA_FAILED");
  }
}
