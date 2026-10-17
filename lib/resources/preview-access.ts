import 'server-only';
import {getHotD1Database} from '@/lib/data/d1/runtime';
import {getResourceR2Bucket} from './r2';
import {versionStorage} from './lifecycle';
export async function authorizedPreview(owner:string,id:string){
 const db=getHotD1Database();const row=await db.prepare("SELECT u.id,u.owner_user_id,u.visibility,u.moderation_status,u.storage_path FROM uploaded_resources u WHERE u.id=?1 AND NOT EXISTS(SELECT 1 FROM resource_workspace_entries w WHERE w.entity_kind='upload' AND w.entity_id=u.id AND w.trashed_at IS NOT NULL)").bind(id).first<{id:string;owner_user_id:string;visibility:string;moderation_status:string;storage_path:string}>();
 if(!row||row.owner_user_id!==owner&&!(row.visibility==='shared'&&row.moderation_status==='approved'))return null;
 const version=row.owner_user_id===owner?await versionStorage(id,owner):null;const key=version?String(version.storage_path):row.storage_path;
 const source=await db.prepare('SELECT id,mime_type,size_bytes FROM uploaded_resources WHERE owner_user_id=?1 AND storage_path=?2 LIMIT 1').bind(row.owner_user_id,key).first<{id:string;mime_type:string;size_bytes:number}>();if(!source)return null;
 const inspection=await db.prepare('SELECT resource_id,source_key,source_etag,content_sha256,state,text_content,thumbnail_key,thumbnail_mime,last_error FROM resource_inspections WHERE resource_id=?1 AND owner_user_id=?2').bind(source.id,row.owner_user_id).first<{resource_id:string;source_key:string;source_etag:string;content_sha256:string;state:string;text_content:string;thumbnail_key:string|null;thumbnail_mime:string|null;last_error:string|null}>();
 if(!inspection||inspection.source_key!==key)return {row,sourceId:source.id,sourceMime:source.mime_type,sourceSize:source.size_bytes,inspection:null};const current=await getResourceR2Bucket().head?.(key);if(!current||current.httpEtag!==inspection.source_etag)return {row,sourceId:source.id,sourceMime:source.mime_type,sourceSize:source.size_bytes,inspection:null};return {row,sourceId:source.id,sourceMime:source.mime_type,sourceSize:source.size_bytes,inspection};
}

const rasterTypes=new Set(['image/png','image/jpeg','image/webp']);
/** Only the owner can repair an inspected raster image's stalled processing job. */
export async function recoverImagePreview(owner:string,id:string,process:(id:string,owner:string)=>Promise<unknown>){
 let allowed=await authorizedPreview(owner,id);
 if(allowed&&allowed.row.owner_user_id===owner&&rasterTypes.has(allowed.sourceMime)&&allowed.sourceSize<=10*1024*1024&&allowed.inspection?.state==='queued'&&/^[0-9a-f]{64}$/.test(allowed.inspection.content_sha256)){
  const db=getHotD1Database(),inspection=allowed.inspection;
  const claim=await db.prepare("UPDATE resource_inspections SET state='processing',updated_at=CURRENT_TIMESTAMP WHERE resource_id=?1 AND owner_user_id=?2 AND state='queued' AND content_sha256=?3 AND source_etag=?4").bind(allowed.sourceId,owner,inspection.content_sha256,inspection.source_etag).run() as {changes?:number;meta?:{changes?:number}};
  if((claim.meta?.changes??claim.changes)===1){try{await process(allowed.sourceId,owner);}catch{await db.prepare("UPDATE resource_inspections SET state='failed',last_error='Preview processing will retry',updated_at=CURRENT_TIMESTAMP WHERE resource_id=?1 AND state='processing'").bind(allowed.sourceId).run();}allowed=await authorizedPreview(owner,id);}
 }
 return allowed;
}
/** Temporary owner-only visual fallback; shared viewers receive derivatives only. */
export async function ownedRasterPreview(owner:string,allowed:Awaited<ReturnType<typeof authorizedPreview>>){
 if(!allowed||allowed.row.owner_user_id!==owner||allowed.inspection?.state!=='ready'||!rasterTypes.has(allowed.sourceMime)||allowed.sourceSize>10*1024*1024||!/^[0-9a-f]{64}$/.test(allowed.inspection.content_sha256))return null;
 const object=await getResourceR2Bucket().get(allowed.inspection.source_key);
 if(!object)return null;
 if(object.httpEtag!==allowed.inspection.source_etag||object.size!==allowed.sourceSize){await object.body.cancel();return null;}
 return {object,mime:allowed.sourceMime};
}
