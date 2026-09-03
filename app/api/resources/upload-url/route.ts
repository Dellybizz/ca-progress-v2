import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getResourceStorageAccess } from "@/lib/billing/service";
import { createR2PresignedUrl } from "@/lib/resources/r2-presign";
import { RESOURCE_MAX_BYTES, normalizeFilename } from "@/lib/resources/validation";
import { getHotD1Database } from "@/lib/data/d1/runtime";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ["application/pdf"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"],
  webp: ["image/webp"], doc: ["application/msword"], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};

function error(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "private, no-store" } });
}
function extension(name: string) { return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ""; }

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return error("Authentication required.", 401, "AUTH_REQUIRED");
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const filename = typeof body?.filename === "string" ? body.filename.trim() : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
  const sizeBytes = Number(body?.sizeBytes);
  const ext = extension(filename);
  if (!filename || filename.length > 180 || !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > RESOURCE_MAX_BYTES) return error("File name or size is invalid.", 400, "UPLOAD_DESCRIPTOR_INVALID");
  if (!MIME_BY_EXTENSION[ext]?.includes(mimeType)) return error("File MIME type does not match the allowed extension.", 400, "UPLOAD_MIME_INVALID");

  const access = await getResourceStorageAccess(identity.id);
  if (!access.allowed) return error(access.upgradeMessage || "Your plan does not allow file storage.", 403, "ENTITLEMENT_REQUIRED");
  if (access.limitBytes !== null && access.usedBytes + sizeBytes > access.limitBytes) return error(access.upgradeMessage || "Your plan storage allowance has been reached.", 403, "STORAGE_LIMIT_REACHED");

  const objectKey = `uploads/${identity.id}/${crypto.randomUUID()}/${normalizeFilename(filename)}`;
  let signed;
  try { signed = await createR2PresignedUrl({ key: objectKey, method: "PUT", expiresInSeconds: 300, contentType: mimeType }); }
  catch { return error("Direct R2 upload is temporarily unavailable.", 503, "R2_SIGNING_NOT_CONFIGURED"); }

  const uploadId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  await getHotD1Database().prepare("INSERT INTO r2_upload_intents(id,user_id,object_key,filename,mime_type,expected_size_bytes,metadata_json,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)")
    .bind(uploadId, identity.id, signed.url.split(`/${RESOURCE_R2_BUCKET_NAME}/`)[1]?.split("?")[0] ?? "", filename, mimeType, sizeBytes, JSON.stringify({ title: body?.title ?? "", description: body?.description ?? "", subjectId: body?.subjectId ?? null, chapterId: body?.chapterId ?? null, visibility: body?.visibility === "shared" ? "shared" : "private" }), expiresAt).run();
  return NextResponse.json({ uploadId, uploadUrl: signed.url, expiresAt, headers: { "Content-Type": mimeType }, maxBytes: RESOURCE_MAX_BYTES }, { headers: { "Cache-Control": "private, no-store" } });
}
