import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getResourceStorageAccess, createResourceMetadataWithinQuota } from "@/lib/billing/service";
import { getResourceR2Bucket, RESOURCE_R2_STORAGE_BUCKET } from "@/lib/resources/r2";
import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";
import {dispatchResourceProcessing} from "@/lib/resources/processing-outbox";
import {inspectResourceSource,InvalidResourceBytes,LARGE_PREVIEW_UNAVAILABLE} from "@/lib/resources/source-inspection";
import { normalizeFilename } from "@/lib/resources/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return fail("Authentication required.", 401, "AUTH_REQUIRED");
  const body = await request.json().catch(() => null) as { uploadId?: unknown } | null;
  const uploadId = typeof body?.uploadId === "string" ? body.uploadId : "";
  if (!uploadId) return fail("Upload id is required.", 400, "UPLOAD_ID_REQUIRED");

  const database: HotD1Database = getHotD1Database();
  const intent = await database.prepare("SELECT id,user_id,object_key,filename,mime_type,expected_size_bytes,metadata_json,expires_at,status FROM r2_upload_intents WHERE id=?1 LIMIT 1").bind(uploadId).first() as Record<string, unknown> | null;
  if (!intent || intent.user_id !== identity.id) return fail("Upload not found.", 404, "UPLOAD_NOT_FOUND");
  if (intent.status === "completed" || intent.status === "issued") {
    const existing = await database.prepare("SELECT id,moderation_status FROM uploaded_resources WHERE owner_user_id=?1 AND storage_path=?2 LIMIT 1").bind(identity.id,String(intent.object_key)).first<{id:string;moderation_status:string}>();
    if (existing) {
      if(intent.status==='issued') {
        try { await database.batch([
          database.prepare("UPDATE r2_upload_intents SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?1").bind(uploadId),
          database.prepare('INSERT OR IGNORE INTO resource_processing_outbox(resource_id,owner_user_id) VALUES(?1,?2)').bind(existing.id,identity.id),
        ]); await dispatchResourceProcessing(existing.id); } catch { /* Durable metadata remains valid; the cleanup repair job retries dispatch. */ }
      }
      return NextResponse.json({id:existing.id,status:existing.moderation_status,storage:RESOURCE_R2_STORAGE_BUCKET,processing:"queued"},{headers:{"Cache-Control":"private, no-store"}});
    }
  }
  if (intent.status !== "issued") return fail("This upload has already been completed or closed.", 409, "UPLOAD_NOT_ACTIVE");
  const completionToken=crypto.randomUUID();
  await database.prepare("DELETE FROM resource_completion_claims WHERE intent_id=?1 AND julianday(expires_at)<julianday('now')").bind(uploadId).run();
  const claimed=await database.prepare('INSERT OR IGNORE INTO resource_completion_claims(intent_id,token,expires_at) VALUES(?1,?2,?3)').bind(uploadId,completionToken,new Date(Date.now()+1800000).toISOString()).run() as {meta?:{changes?:number}};
  if(Number(claimed.meta?.changes??0)!==1)return fail('This file is being verified. Retry shortly.',409,'UPLOAD_VERIFYING');
  try {
  const transferState=await database.prepare('SELECT state FROM resource_transfers WHERE intent_id=?1').bind(uploadId).first<{state:string}>();
  if(transferState&&['cancelled','quarantined'].includes(transferState.state))return fail('This transfer is closed.',410,'UPLOAD_NOT_ACTIVE');

  if (Date.parse(String(intent.expires_at)) <= Date.now()) {
    await database.prepare("UPDATE r2_upload_intents SET status='abandoned' WHERE id=?1").bind(uploadId).run();
    return fail("The upload URL expired. Start the upload again.", 410, "UPLOAD_EXPIRED");
  }

  let bucket;
  try { bucket = getResourceR2Bucket(); } catch { return fail("R2 storage is unavailable.", 503, "R2_NOT_CONFIGURED"); }
  if (typeof bucket.head !== "function") return fail("R2 object metadata checks are unavailable.", 503, "R2_HEAD_NOT_CONFIGURED");
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

  let largeSource=false;
  let verifiedHash:string;
  let verifiedEtag=String(object.httpEtag);
  try {
    const stored=await bucket.get(String(intent.object_key));
    if(!stored)throw Error('Upload bytes are unavailable.');
    const inspected=await inspectResourceSource(stored.body,Number(intent.expected_size_bytes),String(intent.filename).split('.').pop()?.toLowerCase()??'',async()=>{const renewed=await database.prepare('UPDATE resource_completion_claims SET expires_at=?1 WHERE intent_id=?2 AND token=?3').bind(new Date(Date.now()+1800000).toISOString(),uploadId,completionToken).run() as {meta?:{changes?:number}};if(Number(renewed.meta?.changes??0)!==1)throw Error('Verification lease changed. Retry this file.');});
    if(stored.httpEtag!==object.httpEtag)throw new InvalidResourceBytes('Upload bytes changed during verification.');
    largeSource=inspected.large;verifiedHash=inspected.hash;
    const expected=await database.prepare('SELECT content_sha256 FROM resource_transfers WHERE intent_id=?1').bind(uploadId).first<{content_sha256:string}>();
    if(expected&&expected.content_sha256!==verifiedHash)throw new InvalidResourceBytes('Upload bytes do not match the selected file.');
    // Freeze accepted bytes under a key that was never exposed in a PUT URL.
    const immutableKey=`files/${identity.id}/${uploadId}/${normalizeFilename(String(intent.filename))}`;
    if(String(intent.object_key)!==immutableKey){
      const stagedKey=String(intent.object_key);
      if(!inspected.bytes)throw Error('Large files must use the resumable transfer path. Retry this file.');
      await bucket.put(immutableKey,inspected.bytes,{httpMetadata:{contentType:String(intent.mime_type)},customMetadata:{owner:identity.id,sha256:verifiedHash}});
      const frozen=await bucket.head(immutableKey);if(!frozen)throw Error('Verified file could not be frozen.');verifiedEtag=String(frozen.httpEtag);
      await database.prepare("UPDATE r2_upload_intents SET object_key=?1 WHERE id=?2 AND status='issued'").bind(immutableKey,uploadId).run();
      intent.object_key=immutableKey;
      await database.prepare('INSERT OR IGNORE INTO resource_derivative_cleanup(object_key,owner_user_id) VALUES(?1,?2)').bind(stagedKey,identity.id).run();
    }
  } catch(error) {
    if(!(error instanceof InvalidResourceBytes))return fail(error instanceof Error?error.message:'Verification temporarily unavailable. Retry this file.',503,'VERIFICATION_RETRY');
    await database.batch([
      database.prepare("UPDATE r2_upload_intents SET status='failed' WHERE id=?1").bind(uploadId),
      database.prepare("UPDATE resource_transfers SET state='quarantined',lease_token=NULL,lease_until=NULL WHERE intent_id=?1").bind(uploadId),
    ]);
    return fail(error instanceof Error?error.message:'Upload inspection failed.',400,'OBJECT_QUARANTINED');
  }

  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(String(intent.metadata_json)) as Record<string, unknown>; } catch { /* safe defaults */ }
  const access = await getResourceStorageAccess(identity.id);
  if (!access.allowed || (access.limitBytes !== null && access.usedBytes + Number(intent.expected_size_bytes) > access.limitBytes)) {
    await bucket.delete(String(intent.object_key)).catch(() => undefined);
    await database.prepare("UPDATE r2_upload_intents SET status='failed' WHERE id=?1").bind(uploadId).run();
    return fail(access.upgradeMessage || "Your storage allowance has changed.", 403, "STORAGE_LIMIT_REACHED");
  }

  let committedId:string|null=null;
  try {
    const inserted = await createResourceMetadataWithinQuota({
      userId: identity.id,
      title: typeof metadata.title === "string" && metadata.title.trim() ? metadata.title.trim().slice(0, 160) : String(intent.filename).replace(/\.[^.]+$/, ""),
      description: typeof metadata.description === "string" ? metadata.description.trim().slice(0, 4000) || null : null,
      subjectId: typeof metadata.subjectId === "string" ? metadata.subjectId : null,
      chapterId: typeof metadata.chapterId === "string" ? metadata.chapterId : null,
      originalFilename: String(intent.filename),
      safeFilename: normalizeFilename(String(intent.filename)),
      storagePath: String(intent.object_key),
      mimeType: String(intent.mime_type),
      extension: String(intent.filename).split(".").pop()?.toLowerCase() || "bin",
      sizeBytes: Number(intent.expected_size_bytes),
      visibility: metadata.visibility === "shared" ? "shared" : "private",
    });
    committedId=String(inserted.id);
    await database.batch([
      database.prepare("INSERT OR IGNORE INTO resource_inspections(resource_id,owner_user_id,source_key,source_etag,content_sha256,state,last_error) VALUES(?1,?2,?3,?4,?5,?6,?7)").bind(committedId,identity.id,String(intent.object_key),verifiedEtag,verifiedHash,largeSource?'unsupported':'queued',largeSource?LARGE_PREVIEW_UNAVAILABLE:null),
      database.prepare("INSERT OR IGNORE INTO resource_processing_outbox(resource_id,owner_user_id) VALUES(?1,?2)").bind(committedId,identity.id),
      database.prepare("UPDATE r2_upload_intents SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?1").bind(uploadId),
    ]);
    await dispatchResourceProcessing(committedId).catch(()=>undefined);
    return NextResponse.json({ id: inserted.id, status: inserted.moderationStatus, storage: RESOURCE_R2_STORAGE_BUCKET, processing: "queued" }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if(committedId) return NextResponse.json({id:committedId,processing:'pending',status:'saved'}, {status:201,headers:{'Cache-Control':'private, no-store'}});
    // A racing completion may already have committed this object. Never remove
    // referenced bytes merely because the second metadata insert failed.
    const existing=await database.prepare("SELECT id FROM uploaded_resources WHERE owner_user_id=?1 AND storage_path=?2 LIMIT 1").bind(identity.id,String(intent.object_key)).first<{id:string}>();
    if(existing)return NextResponse.json({id:existing.id,processing:'pending',status:'saved'}, {status:200,headers:{'Cache-Control':'private, no-store'}});
    await bucket.delete(String(intent.object_key)).catch(() => undefined);
    await database.prepare("UPDATE r2_upload_intents SET status='failed' WHERE id=?1").bind(uploadId).run();
    return fail(error instanceof Error ? error.message : "Resource metadata could not be created.", 400, "RESOURCE_METADATA_FAILED");
  }
  } finally { await database.prepare('DELETE FROM resource_completion_claims WHERE intent_id=?1 AND token=?2').bind(uploadId,completionToken).run(); }

}
