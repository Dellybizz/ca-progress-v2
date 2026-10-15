import {nativeCorsHeaders,nativeOptions} from '@/lib/auth/native-cors';
import {NextResponse} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {getHotD1Database} from '@/lib/data/d1/runtime';
import {POST as issueUpload} from '@/app/api/resources/upload-url/route';
import {POST as completeUpload} from '@/app/api/resources/upload-complete/route';
import {contentHash} from '@/lib/resources/inspection';
import {TransferError,ownedTransfer,transferStatus,initializeTransfer,renewSingleTransfer,assembleTransfer,cancelTransfer} from '@/lib/resources/transfers';
export const dynamic='force-dynamic';export const runtime='nodejs';
const json=(request:Request,data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store',...nativeCorsHeaders(request)}});
export const OPTIONS=(request:Request)=>nativeOptions(request);
export async function GET(request:Request){const user=await optionalUser();if(!user)return json(request,{error:'Authentication required.'},401);try{return json(request,await transferStatus(user.id,new URL(request.url).searchParams.get('id')??''));}catch(error){return json(request,{error:error instanceof Error?error.message:'Transfer unavailable.'},error instanceof TransferError?error.status:503);}}
export async function POST(request:Request){
 const user=await optionalUser();if(!user)return json(request,{error:'Authentication required.'},401);const body=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!body)return json(request,{error:'Invalid transfer request.'},400);
 if(body.ownerId!==user.id)return json(request,{error:'Your account changed. Reopen uploads before continuing.'},409);
 const db=getHotD1Database();
 try{
  const id=typeof body.uploadId==='string'?body.uploadId:'';
  if(body.action==='renew')return json(request,await renewSingleTransfer(user.id,id));
  if(body.action==='cancel')return json(request,await cancelTransfer(user.id,id));
  if(body.action==='complete'){
   await assembleTransfer(user.id,id);
   const response=await completeUpload(new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId:id})}));
   const payload=await response.json() as {id?:string};if(response.ok&&payload.id)await db.prepare("UPDATE resource_transfers SET state='completed',lease_until=NULL,lease_token=NULL WHERE intent_id=?1").bind(id).run();return json(request,payload,response.status);
  }
  if(body.action!=='create'||typeof body.clientId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.clientId)||typeof body.sha256!=='string'||!/^[a-f0-9]{64}$/.test(body.sha256))return json(request,{error:'Invalid transfer descriptor.'},400);
  const descriptor={filename:body.filename,mimeType:body.mimeType,sizeBytes:body.sizeBytes,title:body.title,description:body.description,subjectId:body.subjectId,chapterId:body.chapterId,visibility:body.visibility,durable:true};
  const hash=await contentHash(new TextEncoder().encode(JSON.stringify({descriptor,sha256:body.sha256})));
  const existing=await db.prepare('SELECT intent_id,request_hash FROM resource_transfers WHERE owner_user_id=?1 AND client_id=?2').bind(user.id,body.clientId).first<{intent_id:string;request_hash:string}>();
  if(existing){if(existing.request_hash!==hash)throw new TransferError('This transfer belongs to different file bytes or metadata.');await ownedTransfer(user.id,existing.intent_id);return json(request,await initializeTransfer(user.id,existing.intent_id));}
  const duplicate=await db.prepare("SELECT i.resource_id,u.title FROM resource_inspections i JOIN uploaded_resources u ON u.id=i.resource_id WHERE i.owner_user_id=?1 AND i.content_sha256=?2 AND NOT EXISTS(SELECT 1 FROM resource_workspace_entries w WHERE w.entity_kind='upload' AND w.entity_id=u.id AND w.trashed_at IS NOT NULL) LIMIT 1").bind(user.id,body.sha256).first<{resource_id:string;title:string}>();
  if(duplicate&&body.allowDuplicate!==true)return json(request,{error:'This file is already in your library.',code:'DUPLICATE_FILE',duplicate},409);
  const response=await issueUpload(new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(descriptor)}));const issued=await response.json() as {uploadId?:string;error?:string};if(!response.ok||!issued.uploadId)return json(request,issued,response.status);
  try{await db.prepare('INSERT INTO resource_transfers(intent_id,owner_user_id,client_id,request_hash,content_sha256) VALUES(?1,?2,?3,?4,?5)').bind(issued.uploadId,user.id,body.clientId,hash,body.sha256).run();}
  catch(error){await db.prepare("UPDATE r2_upload_intents SET status='abandoned' WHERE id=?1").bind(issued.uploadId).run();const race=await db.prepare('SELECT intent_id,request_hash FROM resource_transfers WHERE owner_user_id=?1 AND client_id=?2').bind(user.id,body.clientId).first<{intent_id:string;request_hash:string}>();if(!race||race.request_hash!==hash)throw error;return json(request,await initializeTransfer(user.id,race.intent_id));}
  return json(request,await initializeTransfer(user.id,issued.uploadId),201);
 }catch(error){return json(request,{error:error instanceof Error?error.message:'Transfer is temporarily unavailable.'},error instanceof TransferError?error.status:503);}
}
