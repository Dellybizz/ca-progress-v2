import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getResourceStorageAccess } from "@/lib/billing/service";
import { getHotD1Database } from "@/lib/data/d1/runtime";
import { createR2PresignedUrl } from "@/lib/resources/r2-presign";
import { RESOURCE_MAX_BYTES, normalizeFilename } from "@/lib/resources/validation";
import { getOwnedPhase5Attempt, getPhase5TestAttachmentUsageBytes, parsePhase5AttachmentKind } from "@/lib/tests/phase5";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
};

function fail(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "private, no-store" } });
}
function extension(name: string) { return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ""; }

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return fail("Authentication required.", 401, "AUTH_REQUIRED");
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.trim() : "";
  const filename = typeof body?.filename === "string" ? body.filename.trim() : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
  const sizeBytes = Number(body?.sizeBytes);
  const ext = extension(filename);
  if (!attemptId) return fail("Attempt id is required.", 400, "ATTEMPT_REQUIRED");
  if (!filename || filename.length > 180 || !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > RESOURCE_MAX_BYTES) return fail("File name or size is invalid.", 400, "UPLOAD_DESCRIPTOR_INVALID");
  if (!MIME_BY_EXTENSION[ext]?.includes(mimeType)) return fail("Use a PDF, JPG, PNG or WebP file whose MIME type matches its extension.", 400, "UPLOAD_MIME_INVALID");

  let kind;
  try { kind = parsePhase5AttachmentKind(body?.kind); }
  catch (error) { return fail(error instanceof Error ? error.message : "Invalid attachment type.", 400, "ATTACHMENT_KIND_INVALID"); }

  const attempt = await getOwnedPhase5Attempt(user.id, attemptId);
  if (!attempt) return fail("Test attempt not found.", 404, "ATTEMPT_NOT_FOUND");

  let access;
  try { access = await getResourceStorageAccess(user.id); }
  catch { return fail("Storage access is temporarily unavailable.", 503, "STORAGE_ACCESS_UNAVAILABLE"); }
  if (!access.allowed) return fail(access.upgradeMessage || "Your plan does not allow file storage.", 403, "ENTITLEMENT_REQUIRED");
  const testUsage = await getPhase5TestAttachmentUsageBytes(user.id);
  if (access.limitBytes !== null && access.usedBytes + testUsage + sizeBytes > access.limitBytes) return fail(access.upgradeMessage || "Your storage allowance has been reached.", 403, "STORAGE_LIMIT_REACHED");

  const objectKey = `test-attempts/${user.id}/${attempt.id}/${crypto.randomUUID()}/${normalizeFilename(filename)}`;
  let signed;
  try { signed = await createR2PresignedUrl({ key: objectKey, method: "PUT", expiresInSeconds: 300, contentType: mimeType }); }
  catch { return fail("Direct R2 upload is temporarily unavailable.", 503, "R2_SIGNING_NOT_CONFIGURED"); }

  const uploadId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  try {
    await getHotD1Database().prepare(`INSERT INTO test_attachment_upload_intents
      (id,user_id,attempt_id,attachment_kind,object_key,filename,mime_type,expected_size_bytes,expires_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
      .bind(uploadId, user.id, attempt.id, kind, objectKey, filename, mimeType, sizeBytes, expiresAt).run();
  } catch {
    return fail("Test upload intent could not be persisted.", 503, "UPLOAD_INTENT_PERSIST_FAILED");
  }

  return NextResponse.json({ uploadId, uploadUrl: signed.url, expiresAt, headers: { "Content-Type": mimeType }, maxBytes: RESOURCE_MAX_BYTES }, { headers: { "Cache-Control": "private, no-store" } });
}
