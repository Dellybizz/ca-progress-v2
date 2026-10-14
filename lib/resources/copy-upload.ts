import 'server-only';
import {ownedFile,versionStorage} from './lifecycle';
import {getHotD1Database} from '@/lib/data/d1/runtime';
import {getResourceR2Bucket,RESOURCE_R2_STORAGE_BUCKET} from './r2';
import {createResourceMetadataWithinQuota} from '@/lib/billing/service';
export async function copyOwnedUpload(owner:string,key:string,requestId:string){
 if(!/^[0-9a-f-]{36}$/i.test(requestId))throw Error('Invalid copy receipt.');
 const db=getHotD1Database();const {id,row}=await ownedFile(owner,key,db);if(row.visibility!=='private')throw Error('Only private files can be duplicated.');
 const version=await versionStorage(id,owner,db);const storage={...row,...version};if(storage.storage_bucket!==RESOURCE_R2_STORAGE_BUCKET)throw Error('Legacy storage must be migrated before copying.');
 const path=`uploads/${owner}/copies/${requestId}/${id}`;
 const existing=await db.prepare('SELECT id FROM uploaded_resources WHERE owner_user_id=?1 AND storage_path=?2').bind(owner,path).first<{id:string}>();if(existing)return existing.id;
 const bucket=getResourceR2Bucket();const object=await bucket.get(String(storage.storage_path));if(!object)throw Error('Original file is unavailable.');
 await bucket.put(path,object.body,{httpMetadata:{contentType:String(storage.mime_type)}});
 try{const copy=await createResourceMetadataWithinQuota({userId:owner,title:String(row.title).slice(0,150)+' (copy)',description:row.description?String(row.description):null,subjectId:row.subject_id?String(row.subject_id):null,chapterId:row.chapter_id?String(row.chapter_id):null,originalFilename:String(storage.original_filename),safeFilename:String(row.safe_filename),storagePath:path,mimeType:String(storage.mime_type),extension:String(storage.extension),sizeBytes:Number(storage.size_bytes),visibility:'private'});
 await db.batch([db.prepare("INSERT INTO resource_file_tags(owner_user_id,entity_kind,entity_id,tag) SELECT ?1,'upload',?2,tag FROM resource_file_tags WHERE entity_kind='upload' AND entity_id=?3 AND owner_user_id=?1").bind(owner,String(copy.id),id),db.prepare("INSERT OR IGNORE INTO resource_workspace_entries(owner_user_id,entity_kind,entity_id,folder_id) SELECT ?1,'upload',?2,folder_id FROM resource_workspace_entries WHERE entity_kind='upload' AND entity_id=?3").bind(owner,String(copy.id),id),db.prepare("INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action,detail) VALUES(?1,'upload',?2,'duplicate',?3)").bind(owner,id,String(copy.id))]);return String(copy.id);
 }catch(error){const committed=await db.prepare('SELECT id FROM uploaded_resources WHERE owner_user_id=?1 AND storage_path=?2').bind(owner,path).first<{id:string}>();if(committed)return committed.id;await bucket.delete(path);throw error;}
}
