import 'server-only';
import {getHotD1Database,type HotD1Database} from '@/lib/data/d1/runtime';
import {getResourceR2Bucket,RESOURCE_R2_STORAGE_BUCKET} from './r2';
export async function purgeExpiredResourceTrash(db:HotD1Database=getHotD1Database(),bucket?:{delete:(key:string)=>Promise<unknown>}){
 const rows=await db.prepare('SELECT entity_kind,entity_id,owner_user_id FROM resource_workspace_entries WHERE trashed_at IS NOT NULL AND trash_expires_at<=CURRENT_TIMESTAMP LIMIT 20').all<{entity_kind:'note'|'upload';entity_id:string;owner_user_id:string}>();
 let purged=0;for(const row of rows.results??[]){try{
  if(row.entity_kind==='upload'&&await db.prepare('SELECT id FROM resource_file_versions WHERE version_resource_id=?1 AND resource_id<>?1').bind(row.entity_id).first())continue;
  await db.prepare('UPDATE resource_workspace_entries SET purge_started_at=COALESCE(purge_started_at,CURRENT_TIMESTAMP) WHERE entity_kind=?1 AND entity_id=?2 AND owner_user_id=?3 AND trashed_at IS NOT NULL AND trash_expires_at<=CURRENT_TIMESTAMP').bind(row.entity_kind,row.entity_id,row.owner_user_id).run();
  const claimed=await db.prepare('SELECT entity_id FROM resource_workspace_entries WHERE entity_kind=?1 AND entity_id=?2 AND owner_user_id=?3 AND purge_started_at IS NOT NULL AND trashed_at IS NOT NULL').bind(row.entity_kind,row.entity_id,row.owner_user_id).first();if(!claimed)continue;
  if(row.entity_kind==='upload'){const object=await db.prepare('SELECT storage_bucket,storage_path FROM uploaded_resources WHERE id=?1 AND owner_user_id=?2').bind(row.entity_id,row.owner_user_id).first<{storage_bucket:string;storage_path:string}>();if(object){if(object.storage_bucket!==RESOURCE_R2_STORAGE_BUCKET)continue;await (bucket??getResourceR2Bucket()).delete(object.storage_path);}}
  const table=row.entity_kind==='note'?'notes':'uploaded_resources',ownerColumn=row.entity_kind==='note'?'user_id':'owner_user_id';
  await db.batch([db.prepare(`DELETE FROM ${table} WHERE id=?1 AND ${ownerColumn}=?2 AND EXISTS(SELECT 1 FROM resource_workspace_entries w WHERE w.entity_kind=?3 AND w.entity_id=?1 AND w.purge_started_at IS NOT NULL AND w.trashed_at IS NOT NULL)`).bind(row.entity_id,row.owner_user_id,row.entity_kind),db.prepare('DELETE FROM resource_workspace_entries WHERE entity_kind=?1 AND entity_id=?2 AND owner_user_id=?3 AND purge_started_at IS NOT NULL').bind(row.entity_kind,row.entity_id,row.owner_user_id)]);purged++;
 }catch{/* A verified expired file stays inaccessible; storage/DB cleanup retries. */}}
 await db.prepare('DELETE FROM resource_folders WHERE trashed_at IS NOT NULL AND trash_expires_at<=CURRENT_TIMESTAMP AND NOT EXISTS(SELECT 1 FROM resource_folders child WHERE child.parent_id=resource_folders.id) AND NOT EXISTS(SELECT 1 FROM resource_workspace_entries w WHERE w.folder_id=resource_folders.id)').run();
 return {purged};
}
