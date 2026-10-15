import 'server-only';
import {getHotD1Database} from '@/lib/data/d1/runtime';
import {getResourceR2Bucket} from './r2';
import {versionStorage} from './lifecycle';
export async function authorizedPreview(owner:string,id:string){
 const db=getHotD1Database();const row=await db.prepare("SELECT u.id,u.owner_user_id,u.visibility,u.moderation_status,u.storage_path FROM uploaded_resources u WHERE u.id=?1 AND NOT EXISTS(SELECT 1 FROM resource_workspace_entries w WHERE w.entity_kind='upload' AND w.entity_id=u.id AND w.trashed_at IS NOT NULL)").bind(id).first<{id:string;owner_user_id:string;visibility:string;moderation_status:string;storage_path:string}>();
 if(!row||row.owner_user_id!==owner&&!(row.visibility==='shared'&&row.moderation_status==='approved'))return null;
 const version=row.owner_user_id===owner?await versionStorage(id,owner):null;const key=version?String(version.storage_path):row.storage_path;
 const source=await db.prepare('SELECT id FROM uploaded_resources WHERE owner_user_id=?1 AND storage_path=?2 LIMIT 1').bind(row.owner_user_id,key).first<{id:string}>();if(!source)return null;
 const inspection=await db.prepare('SELECT resource_id,source_key,source_etag,content_sha256,state,text_content,thumbnail_key,thumbnail_mime,last_error FROM resource_inspections WHERE resource_id=?1 AND owner_user_id=?2').bind(source.id,row.owner_user_id).first<{resource_id:string;source_key:string;source_etag:string;content_sha256:string;state:string;text_content:string;thumbnail_key:string|null;thumbnail_mime:string|null;last_error:string|null}>();
 if(!inspection||inspection.source_key!==key)return {row,sourceId:source.id,inspection:null};const current=await getResourceR2Bucket().head?.(key);if(!current||current.httpEtag!==inspection.source_etag)return {row,sourceId:source.id,inspection:null};return {row,sourceId:source.id,inspection};
}
