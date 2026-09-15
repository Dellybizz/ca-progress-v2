import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getResourceStorageAccess } from "@/lib/billing/service";
import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";
import { getResourceR2Bucket, RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { getPhase5TestAttachmentUsageBytes } from "@/lib/tests/phase5";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "private, no-store" } });
}

type Intent = {
  id: string;
  user_id: string;
  attempt_id: string;
  attachment_kind: string;
  object_key: string;
  filename: string;
  mime_type: string;
  expected_size_bytes: number;
  status: string;
  attachment_id: string | null;
  expires_at: string;
};

type Attachment = {
  id: string;
  attempt_id: string;
  attachment_kind: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

async function attachmentResponse(database: HotD1Database, attachmentId: string) {
  const row = await database.prepare(`SELECT id,attempt_id,attachment_kind,filename,mime_type,size_bytes,created_at
    FROM test_attempt_attachments WHERE id=?1 LIMIT 1`).bind(attachmentId).first<Attachment>();
  if (!row) return null;
  return {
    id: row.id,
    attemptId: row.attempt_id,
    kind: row.attachment_kind,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
    storage: RESOURCE_R2_STORAGE_BUCKET,
  };
}

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return fail("Authentication required.", 401, "AUTH_REQUIRED");
  const body = await request.json().catch(() => null) as { uploadId?: unknown } | null;
  const uploadId = typeof body?.uploadId === "string" ? body.uploadId.trim() : "";
  if (!uploadId) return fail("Upload id is required.", 400, "UPLOAD_ID_REQUIRED");

  const database = getHotD1Database();
  const intent = await database.prepare(`SELECT id,user_id,attempt_id,attachment_kind,object_key,filename,mime_type,expected_size_bytes,status,attachment_id,expires_at
    FROM test_attachment_upload_intents WHERE id=?1 LIMIT 1`).bind(uploadId).first<Intent>();
  if (!intent || intent.user_id !== user.id) return fail("Upload not found.", 404, "UPLOAD_NOT_FOUND");

  if (intent.status === "completed" && intent.attachment_id) {
    const existing = await attachmentResponse(database, intent.attachment_id);
    if (existing) return NextResponse.json({ ...existing, retry: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (intent.status !== "issued") return fail("This upload is no longer active.", 409, "UPLOAD_NOT_ACTIVE");
  if (Date.parse(intent.expires_at) <= Date.now()) {
    await database.prepare("UPDATE test_attachment_upload_intents SET status='abandoned' WHERE id=?1 AND user_id=?2").bind(uploadId, user.id).run();
    return fail("The upload URL expired. Start the attachment upload again.", 410, "UPLOAD_EXPIRED");
  }

  let bucket;
  try { bucket = getResourceR2Bucket(); }
  catch { return fail("R2 storage is unavailable.", 503, "R2_NOT_CONFIGURED"); }
  if (typeof bucket.head !== "function") return fail("R2 object metadata checks are unavailable.", 503, "R2_HEAD_NOT_CONFIGURED");

  const object = await bucket.head(intent.object_key);
  if (!object) return fail("The direct upload was not found in R2.", 404, "OBJECT_NOT_FOUND");
  if (Number(object.size) !== Number(intent.expected_size_bytes)) {
    await bucket.delete(intent.object_key).catch(() => undefined);
    await database.prepare("UPDATE test_attachment_upload_intents SET status='failed' WHERE id=?1 AND user_id=?2").bind(uploadId, user.id).run();
    return fail("Uploaded file size does not match the issued descriptor.", 400, "OBJECT_SIZE_MISMATCH");
  }
  const actualMime = String(object.httpMetadata?.contentType ?? "").toLowerCase();
  if (actualMime !== intent.mime_type.toLowerCase()) {
    await bucket.delete(intent.object_key).catch(() => undefined);
    await database.prepare("UPDATE test_attachment_upload_intents SET status='failed' WHERE id=?1 AND user_id=?2").bind(uploadId, user.id).run();
    return fail("Uploaded file MIME type does not match the issued descriptor.", 400, "OBJECT_MIME_MISMATCH");
  }

  let access;
  try { access = await getResourceStorageAccess(user.id); }
  catch { return fail("Storage access is temporarily unavailable.", 503, "STORAGE_ACCESS_UNAVAILABLE"); }
  const testUsage = await getPhase5TestAttachmentUsageBytes(user.id, database);
  if (!access.allowed || (access.limitBytes !== null && access.usedBytes + testUsage + Number(intent.expected_size_bytes) > access.limitBytes)) {
    await bucket.delete(intent.object_key).catch(() => undefined);
    await database.prepare("UPDATE test_attachment_upload_intents SET status='failed' WHERE id=?1 AND user_id=?2").bind(uploadId, user.id).run();
    return fail(access.upgradeMessage || "Your storage allowance has changed.", 403, "STORAGE_LIMIT_REACHED");
  }

  const attachmentId = crypto.randomUUID();
  const savedAt = new Date().toISOString();
  try {
    await database.batch([
      database.prepare(`INSERT INTO test_attempt_attachments
        (id,attempt_id,user_id,attachment_kind,object_key,filename,mime_type,size_bytes,created_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
        .bind(attachmentId, intent.attempt_id, user.id, intent.attachment_kind, intent.object_key, intent.filename, intent.mime_type, Number(intent.expected_size_bytes), savedAt),
      database.prepare(`UPDATE test_attachment_upload_intents
        SET status='completed',attachment_id=?1,completed_at=?2
        WHERE id=?3 AND user_id=?4 AND status='issued'`)
        .bind(attachmentId, savedAt, uploadId, user.id),
    ]);
  } catch (error) {
    const refreshed = await database.prepare("SELECT status,attachment_id FROM test_attachment_upload_intents WHERE id=?1 AND user_id=?2 LIMIT 1")
      .bind(uploadId, user.id).first<{ status: string; attachment_id: string | null }>();
    if (refreshed?.status === "completed" && refreshed.attachment_id) {
      const existing = await attachmentResponse(database, refreshed.attachment_id);
      if (existing) return NextResponse.json({ ...existing, retry: true }, { headers: { "Cache-Control": "private, no-store" } });
    }
    await bucket.delete(intent.object_key).catch(() => undefined);
    await database.prepare("UPDATE test_attachment_upload_intents SET status='failed' WHERE id=?1 AND user_id=?2 AND status='issued'").bind(uploadId, user.id).run();
    return fail(error instanceof Error ? error.message : "Attachment metadata could not be created.", 400, "ATTACHMENT_METADATA_FAILED");
  }

  const created = await attachmentResponse(database, attachmentId);
  if (!created) return fail("Saved attachment could not be reloaded.", 500, "ATTACHMENT_RELOAD_FAILED");
  return NextResponse.json({ ...created, retry: false }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
