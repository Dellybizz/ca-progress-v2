import 'server-only';
import {getHotD1Database,type HotD1Database} from '@/lib/data/d1/runtime';
import {getResourceR2Bucket,type ResourceR2Bucket} from './r2';
import {createR2PresignedUrl} from './r2-presign';
import {boundedBytes,contentHash} from './inspection';
export const TRANSFER_PART_BYTES=5*1024*1024;
export type Transfer={intent_id:string;owner_user_id:string;client_id:string;content_sha256:string;multipart_id:string|null;state:string;lease_until:string|null;lease_token:string|null;object_key:string;expected_size_bytes:number;filename:string;mime_type:string;expires_at:string;request_hash:string;intent_status:string};
export class TransferError extends Error{constructor(message:string,public status=409){super(message);}}
export async function ownedTransfer(owner:string,id:string,db:HotD1Database=getHotD1Database()){
 const row=await db.prepare('SELECT t.*,i.object_key,i.expected_size_bytes,i.filename,i.mime_type,i.expires_at,i.status intent_status FROM resource_transfers t JOIN r2_upload_intents i ON i.id=t.intent_id WHERE t.intent_id=?1 AND t.owner_user_id=?2').bind(id,owner).first<Transfer>();
 if(!row)throw new TransferError('Transfer not found.',404);return row;
}
export function assertActive(row:Transfer){if(['cancelled','quarantined'].includes(row.state))throw new TransferError('Transfer is closed.',410);if(Date.parse(row.expires_at)<=Date.now()&&row.state!=='completed')throw new TransferError('Transfer expired. Restart this file.',410);}
const changed=(result:unknown)=>Number((result as {meta?:{changes?:number};changes?:number}).meta?.changes??(result as {changes?:number}).changes??0);
export async function transferStatus(owner:string,id:string,db:HotD1Database=getHotD1Database()){
 const row=await ownedTransfer(owner,id,db);const parts=await db.prepare('SELECT part_number,etag,sha256,size_bytes FROM resource_transfer_parts WHERE intent_id=?1 ORDER BY part_number').bind(id).all();
 const saved=await db.prepare('SELECT id FROM uploaded_resources WHERE owner_user_id=?1 AND storage_path=?2').bind(owner,row.object_key).first<{id:string}>();
 return {uploadId:id,state:saved?'completed':row.intent_status==='failed'?'quarantined':row.intent_status==='abandoned'?'cancelled':row.state,resourceId:saved?.id??null,expiresAt:row.expires_at,multipart:!!row.multipart_id,partBytes:TRANSFER_PART_BYTES,parts:parts.results??[]};
}
export async function initializeTransfer(owner:string,id:string,db:HotD1Database=getHotD1Database(),bucket:ResourceR2Bucket=getResourceR2Bucket()){
 const row=await ownedTransfer(owner,id,db);assertActive(row);if(row.state!=='initializing')return transferStatus(owner,id,db);
 const token=crypto.randomUUID();const lease=new Date(Date.now()+60000).toISOString();
 const lock=await db.prepare("UPDATE resource_transfers SET lease_token=?1,lease_until=?2 WHERE intent_id=?3 AND state='initializing' AND (lease_until IS NULL OR julianday(lease_until)<julianday('now'))").bind(token,lease,id).run();if(!changed(lock))throw new TransferError('Transfer is being prepared. Retry shortly.');
 let multipartId:string|null=null;
 try{if(row.expected_size_bytes>TRANSFER_PART_BYTES)multipartId=(await bucket.createMultipartUpload(row.object_key,{httpMetadata:{contentType:row.mime_type}})).uploadId;
  await db.prepare("UPDATE resource_transfers SET multipart_id=?1,state='active',lease_until=NULL,lease_token=NULL WHERE intent_id=?2 AND lease_token=?3").bind(multipartId,id,token).run();
 }catch(error){if(multipartId)await bucket.resumeMultipartUpload(row.object_key,multipartId).abort().catch(()=>undefined);await db.prepare('UPDATE resource_transfers SET lease_until=NULL,lease_token=NULL WHERE intent_id=?1 AND lease_token=?2').bind(id,token).run();throw error;}
 return transferStatus(owner,id,db);
}
export async function renewSingleTransfer(owner:string,id:string){const row=await ownedTransfer(owner,id);assertActive(row);if(row.multipart_id||row.state!=='active')throw new TransferError('Transfer is not a single upload.');const signed=await createR2PresignedUrl({key:row.object_key,method:'PUT',contentType:row.mime_type,expiresInSeconds:300});return {uploadUrl:signed.url,headers:{'Content-Type':row.mime_type},expiresAt:signed.expiresAt};}
export async function uploadTransferPart(owner:string,id:string,number:number,expectedHash:string,body:ReadableStream<Uint8Array>,db:HotD1Database=getHotD1Database(),bucket:ResourceR2Bucket=getResourceR2Bucket()){
 const row=await ownedTransfer(owner,id,db);assertActive(row);const parts=Math.ceil(row.expected_size_bytes/TRANSFER_PART_BYTES);if((!row.multipart_id&&row.expected_size_bytes>TRANSFER_PART_BYTES)||row.state!=='active'||!Number.isInteger(number)||number<1||number>parts||!/^[a-f0-9]{64}$/.test(expectedHash))throw new TransferError('Part descriptor is invalid.',400);
 const prior=await db.prepare('SELECT etag,sha256 FROM resource_transfer_parts WHERE intent_id=?1 AND part_number=?2').bind(id,number).first<{etag:string;sha256:string}>();if(prior){if(prior.sha256!==expectedHash)throw new TransferError('This part contains different bytes.');return {partNumber:number,etag:prior.etag};}
 const token=crypto.randomUUID();const locked=await db.prepare("UPDATE resource_transfers SET lease_token=?1,lease_until=?2 WHERE intent_id=?3 AND state='active' AND (lease_until IS NULL OR julianday(lease_until)<julianday('now'))").bind(token,new Date(Date.now()+60000).toISOString(),id).run();if(!changed(locked))throw new TransferError('Another part is being saved. Retry shortly.');
 try{const expectedSize=number<parts?TRANSFER_PART_BYTES:row.expected_size_bytes-(parts-1)*TRANSFER_PART_BYTES;const bytes=await boundedBytes(body,expectedSize);if(bytes.length!==expectedSize||await contentHash(bytes)!==expectedHash)throw new TransferError('Part bytes do not match their receipt.',400);
  const part=row.multipart_id
   ? await bucket.resumeMultipartUpload(row.object_key,row.multipart_id).uploadPart(number,bytes)
   : await (async()=>{await bucket.put(row.object_key,bytes,{httpMetadata:{contentType:row.mime_type}});const object=await bucket.head?.(row.object_key);if(!object||object.size!==bytes.length)throw new TransferError('Upload receipt could not be verified.',503);return {partNumber:number,etag:object.httpEtag};})();
  if(!await db.prepare("SELECT intent_id FROM resource_transfers WHERE intent_id=?1 AND state='active' AND lease_token=?2").bind(id,token).first())throw new TransferError('Transfer changed while this part was uploading.');
  await db.batch([db.prepare('INSERT INTO resource_transfer_parts(intent_id,part_number,etag,sha256,size_bytes) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(intent_id,part_number) DO UPDATE SET etag=excluded.etag,sha256=excluded.sha256,size_bytes=excluded.size_bytes').bind(id,number,part.etag,expectedHash,bytes.length),db.prepare('UPDATE resource_transfers SET lease_until=NULL,lease_token=NULL,updated_at=CURRENT_TIMESTAMP WHERE intent_id=?1 AND lease_token=?2').bind(id,token)]);return part;
 }finally{await db.prepare('UPDATE resource_transfers SET lease_until=NULL,lease_token=NULL WHERE intent_id=?1 AND lease_token=?2').bind(id,token).run();}
}
export async function assembleTransfer(owner:string,id:string,db:HotD1Database=getHotD1Database(),bucket:ResourceR2Bucket=getResourceR2Bucket()){
 const row=await ownedTransfer(owner,id,db);assertActive(row);if(row.state==='completed'||row.state==='uploaded')return;
 // An assembled object survives a lost completion response or process crash.
 if(row.state==='assembling'&&await bucket.head?.(row.object_key)){await db.prepare("UPDATE resource_transfers SET state='uploaded',lease_token=NULL,lease_until=NULL WHERE intent_id=?1").bind(id).run();return;}
 const token=crypto.randomUUID();const lock=await db.prepare("UPDATE resource_transfers SET state='assembling',lease_token=?1,lease_until=?2 WHERE intent_id=?3 AND state IN ('active','assembling') AND (lease_until IS NULL OR julianday(lease_until)<julianday('now'))").bind(token,new Date(Date.now()+60000).toISOString(),id).run();if(!changed(lock))throw new TransferError('Transfer is being finalized. Retry shortly.');
 try{if(row.multipart_id){const parts=(await db.prepare('SELECT part_number,etag,size_bytes FROM resource_transfer_parts WHERE intent_id=?1 ORDER BY part_number').bind(id).all<{part_number:number;etag:string;size_bytes:number}>()).results??[];if(parts.length!==Math.ceil(row.expected_size_bytes/TRANSFER_PART_BYTES)||parts.reduce((sum,p)=>sum+p.size_bytes,0)!==row.expected_size_bytes)throw new TransferError('Some parts are still missing.');await bucket.resumeMultipartUpload(row.object_key,row.multipart_id).complete(parts.map(p=>({partNumber:p.part_number,etag:p.etag})));}else if(!await bucket.head?.(row.object_key))throw new TransferError('Upload bytes have not arrived.',404);
  await db.prepare("UPDATE resource_transfers SET state='uploaded',lease_token=NULL,lease_until=NULL WHERE intent_id=?1 AND lease_token=?2").bind(id,token).run();
 }catch(error){await db.prepare("UPDATE resource_transfers SET state='active',lease_token=NULL,lease_until=NULL WHERE intent_id=?1 AND lease_token=?2").bind(id,token).run();throw error;}
}
export async function cancelTransfer(owner:string,id:string,db:HotD1Database=getHotD1Database(),bucket:ResourceR2Bucket=getResourceR2Bucket()){
 const row=await ownedTransfer(owner,id,db);if(await db.prepare('SELECT id FROM uploaded_resources WHERE owner_user_id=?1 AND storage_path=?2').bind(owner,row.object_key).first())throw new TransferError('This file is already saved. Use Trash to remove it.');
 const lock=await db.prepare("UPDATE resource_transfers SET state='cancelled' WHERE intent_id=?1 AND state IN ('initializing','active','uploaded','cancelled') AND (lease_until IS NULL OR julianday(lease_until)<julianday('now')) AND NOT EXISTS(SELECT 1 FROM resource_completion_claims c WHERE c.intent_id=resource_transfers.intent_id AND julianday(c.expires_at)>=julianday('now'))").bind(id).run();if(!changed(lock))throw new TransferError('Transfer is in progress. Pause and retry cancellation.');
 if(row.multipart_id)await bucket.resumeMultipartUpload(row.object_key,row.multipart_id).abort().catch(()=>undefined);
 await bucket.delete(row.object_key);await db.prepare("UPDATE r2_upload_intents SET status='abandoned' WHERE id=?1 AND status='issued'").bind(id).run();return {cancelled:true};
}
