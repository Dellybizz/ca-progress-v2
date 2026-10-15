import 'server-only';
import {inspectResourceSource,LARGE_PREVIEW_UNAVAILABLE} from './source-inspection';
import {copyResourceStream} from './stream-copy';
import {dispatchResourceProcessing} from './processing-outbox';
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
 const sourceInspection=await db.prepare('SELECT state FROM resource_inspections WHERE source_key=?1 AND owner_user_id=?2 LIMIT 1').bind(String(storage.storage_path),owner).first<{state:string}>();if(sourceInspection&&['quarantined','failed','processing','queued'].includes(sourceInspection.state))throw Error('This file must finish inspection before it can be copied.');
 const inspected=await inspectResourceSource(object.body,Number(storage.size_bytes),String(storage.extension));const hash=inspected.hash;
 const source=await bucket.get(String(storage.storage_path));if(!source||source.httpEtag!==object.httpEtag)throw Error('Source changed while copying.');
 await copyResourceStream(bucket,path,source.body,Number(storage.size_bytes),String(storage.mime_type));
 const frozen=await bucket.head?.(path);if(!frozen)throw Error('Copied source is unavailable.');
 try{const copy=await createResourceMetadataWithinQuota({userId:owner,title:String(row.title).slice(0,150)+' (copy)',description:row.description?String(row.description):null,subjectId:row.subject_id?String(row.subject_id):null,chapterId:row.chapter_id?String(row.chapter_id):null,originalFilename:String(storage.original_filename),safeFilename:String(row.safe_filename),storagePath:path,mimeType:String(storage.mime_type),extension:String(storage.extension),sizeBytes:Number(storage.size_bytes),visibility:'private'});
 await db.batch([db.prepare("INSERT OR IGNORE INTO resource_inspections(resource_id,owner_user_id,source_key,source_etag,content_sha256,state,last_error) VALUES(?1,?2,?3,?4,?5,?6,?7)").bind(String(copy.id),owner,path,frozen.httpEtag,hash,inspected.large?'unsupported':'queued',inspected.large?LARGE_PREVIEW_UNAVAILABLE:null),db.prepare('INSERT OR IGNORE INTO resource_processing_outbox(resource_id,owner_user_id) VALUES(?1,?2)').bind(String(copy.id),owner),db.prepare("INSERT INTO resource_file_tags(owner_user_id,entity_kind,entity_id,tag) SELECT ?1,'upload',?2,tag FROM resource_file_tags WHERE entity_kind='upload' AND entity_id=?3 AND owner_user_id=?1").bind(owner,String(copy.id),id),db.prepare("INSERT OR IGNORE INTO resource_workspace_entries(owner_user_id,entity_kind,entity_id,folder_id) SELECT ?1,'upload',?2,folder_id FROM resource_workspace_entries WHERE entity_kind='upload' AND entity_id=?3").bind(owner,String(copy.id),id),db.prepare("INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action,detail) VALUES(?1,'upload',?2,'duplicate',?3)").bind(owner,id,String(copy.id))]);await dispatchResourceProcessing(String(copy.id)).catch(()=>undefined);return String(copy.id);
 }catch(error){const committed=await db.prepare('SELECT id FROM uploaded_resources WHERE owner_user_id=?1 AND storage_path=?2').bind(owner,path).first<{id:string}>();if(committed)return committed.id;await bucket.delete(path);throw error;}
}
