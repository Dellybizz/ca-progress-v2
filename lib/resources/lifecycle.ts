import 'server-only';
import {workspaceErrorMessage} from './workspace-errors';
import {getHotD1Database,type HotD1Database} from '@/lib/data/d1/runtime';
export async function ownedFile(owner:string,key:string,db:HotD1Database=getHotD1Database(),allowTrash=false){
 const match=/^(note|upload):(.+)$/.exec(key);if(!match)throw Error('Invalid file.');const kind=match[1] as 'note'|'upload',id=match[2];
 const row=await db.prepare(`SELECT * FROM ${kind==='note'?'notes':'uploaded_resources'} WHERE id=?1 AND ${kind==='note'?'user_id':'owner_user_id'}=?2`).bind(id,owner).first<Record<string,unknown>>();
 if(!row)throw Error('File not found or not owned by you.');
 if(!allowTrash&&await db.prepare('SELECT entity_id FROM resource_workspace_entries WHERE entity_kind=?1 AND entity_id=?2 AND trashed_at IS NOT NULL').bind(kind,id).first())throw Error('Restore this file before changing it.');
 return {kind,id,row};
}
export async function fileActivity(owner:string,key:string,db:HotD1Database=getHotD1Database()){
 const {kind,id}=await ownedFile(owner,key,db,true);
 const [activity,versions]=await Promise.all([db.prepare('SELECT id,action,detail,created_at FROM resource_file_activity WHERE owner_user_id=?1 AND entity_kind=?2 AND entity_id=?3 ORDER BY id DESC LIMIT 100').bind(owner,kind,id).all(),kind==='upload'?db.prepare('SELECT v.id,v.version_resource_id,v.active,v.created_at,u.original_filename,u.size_bytes FROM resource_file_versions v JOIN uploaded_resources u ON u.id=v.version_resource_id WHERE v.owner_user_id=?1 AND v.resource_id=?2 ORDER BY v.created_at,v.id').bind(owner,id).all():Promise.resolve({results:[]})]);
 return {activity:activity.results??[],versions:versions.results??[]};
}
export async function lifecycleAction(owner:string,input:Record<string,unknown>,db:HotD1Database=getHotD1Database()){
 const action=String(input.action);const keys=Array.isArray(input.keys)?[...new Set(input.keys)].filter((v):v is string=>typeof v==='string'):[];if(!keys.length||keys.length>96)throw Error('Select 1–96 files.');
 const results:{key:string;ok:boolean;id?:string;error?:string}[]=[];
 for(const key of keys){try{
 const {kind,id,row}=await ownedFile(owner,key,db,action==='erase');const log=(detail='')=>db.prepare('INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action,detail) VALUES(?1,?2,?3,?4,?5)').bind(owner,kind,id,action,detail);
 if(action==='rename'){
  const name=typeof input.name==='string'?input.name.trim():'';if(!name||name.length>160||keys.length!==1)throw Error('Select one file and use a name of 1–160 characters.');
  if(row.visibility!=='private')throw Error('Rename private files here; shared originals retain their published identity.');
  await db.batch([db.prepare(`UPDATE ${kind==='note'?'notes':'uploaded_resources'} SET title=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2 AND ${kind==='note'?'user_id':'owner_user_id'}=?3 AND visibility='private'`).bind(name,id,owner),log(name)]);
 }else if(action==='tag'){
  const tags=Array.isArray(input.tags)?[...new Set(input.tags.map(v=>String(v).trim().toLowerCase()).filter(Boolean))]:[];if(tags.length>12||tags.some(t=>t.length>32))throw Error('Use up to 12 tags, each no longer than 32 characters.');
  const noteTags=kind==='note'?[db.prepare('DELETE FROM note_tag_map WHERE note_id=?1 AND user_id=?2').bind(id,owner),...tags.flatMap(tag=>[db.prepare('INSERT INTO note_tags(id,user_id,name,normalized_name) VALUES(?1,?2,?3,?3) ON CONFLICT(user_id,normalized_name) DO UPDATE SET name=excluded.name').bind(crypto.randomUUID(),owner,tag),db.prepare('INSERT INTO note_tag_map(note_id,tag_id,user_id) SELECT ?1,id,?2 FROM note_tags WHERE user_id=?2 AND normalized_name=?3').bind(id,owner,tag)])]:[];
  await db.batch([...noteTags,db.prepare('DELETE FROM resource_file_tags WHERE owner_user_id=?1 AND entity_kind=?2 AND entity_id=?3').bind(owner,kind,id),...tags.map(tag=>db.prepare('INSERT INTO resource_file_tags(owner_user_id,entity_kind,entity_id,tag) VALUES(?1,?2,?3,?4)').bind(owner,kind,id,tag)),log(tags.join(', '))]);
 }else if(action==='erase'){
  if(input.confirm!==true)throw Error('Confirm permanent deletion.');
  if(await db.prepare('SELECT id FROM resource_file_versions WHERE version_resource_id=?1 AND resource_id<>?1').bind(id).first())throw Error('This file is retained by a file version. Delete the containing file first.');
  const trash=await db.prepare('SELECT entity_id FROM resource_workspace_entries WHERE owner_user_id=?1 AND entity_kind=?2 AND entity_id=?3 AND trashed_at IS NOT NULL').bind(owner,kind,id).first();if(!trash)throw Error('Move the file to Trash first.');
  await db.batch([db.prepare('UPDATE resource_workspace_entries SET trash_expires_at=CURRENT_TIMESTAMP,purge_started_at=CURRENT_TIMESTAMP WHERE owner_user_id=?1 AND entity_kind=?2 AND entity_id=?3 AND trashed_at IS NOT NULL').bind(owner,kind,id),log()]);
 }else if(action==='duplicate'){
  if(row.visibility!=='private')throw Error('Only private files can be duplicated.');
  if(kind!=='note')throw Error('Upload file duplication requires a storage copy.');
  const copyId=typeof input.clientId==='string'&&/^[0-9a-f-]{36}$/i.test(input.clientId)?input.clientId:crypto.randomUUID();
  if(await db.prepare('SELECT id FROM notes WHERE id=?1 AND user_id=?2').bind(copyId,owner).first()){results.push({key,ok:true,id:copyId});continue;}
  await db.batch([
   db.prepare("INSERT INTO notes(id,user_id,owner_label,title,body_html,body_text,subject_id,chapter_id,visibility,moderation_status) SELECT ?1,user_id,owner_label,substr(title,1,150)||' (copy)',body_html,body_text,subject_id,chapter_id,'private','private' FROM notes WHERE id=?2 AND user_id=?3 AND visibility='private'").bind(copyId,id,owner),
   db.prepare('INSERT INTO note_tag_map(note_id,tag_id,user_id) SELECT ?1,tag_id,user_id FROM note_tag_map WHERE note_id=?2 AND user_id=?3').bind(copyId,id,owner),
   db.prepare('INSERT INTO note_resource_links(note_id,resource_id,user_id,embed_kind,position) SELECT ?1,resource_id,user_id,embed_kind,position FROM note_resource_links WHERE note_id=?2 AND user_id=?3').bind(copyId,id,owner),
   db.prepare("INSERT INTO note_revision_metadata(note_id,user_id,level_id,subject_id,chapter_id,topic_id,document_json,source_type,source_message_id,source_channel_id,source_author_label,source_question,source_answer,source_created_at,source_discussion_path) SELECT ?1,user_id,level_id,subject_id,chapter_id,topic_id,document_json,source_type,source_message_id,source_channel_id,source_author_label,source_question,source_answer,source_created_at,source_discussion_path FROM note_revision_metadata WHERE note_id=?2 AND user_id=?3").bind(copyId,id,owner),
   db.prepare("INSERT INTO resource_workspace_entries(owner_user_id,entity_kind,entity_id,folder_id) SELECT ?1,'note',?2,folder_id FROM resource_workspace_entries WHERE entity_kind='note' AND entity_id=?3").bind(owner,copyId,id),db.prepare("INSERT INTO resource_file_tags(owner_user_id,entity_kind,entity_id,tag) SELECT ?1,'note',?2,tag FROM resource_file_tags WHERE entity_kind='note' AND entity_id=?3 AND owner_user_id=?1").bind(owner,copyId,id),db.prepare("INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action,detail) VALUES(?1,'note',?2,'duplicated-from',?3)").bind(owner,copyId,id),log(copyId),
  ]);results.push({key,ok:true,id:copyId});continue;
 }else if(action==='replace-version'||action==='restore-version'){
  if(kind!=='upload'||row.visibility!=='private'||keys.length!==1)throw Error('Versions are available for one private uploaded file.');
  let versionId:string,sourceId:string;
  if(action==='restore-version'){const version=await db.prepare('SELECT id,version_resource_id FROM resource_file_versions WHERE id=?1 AND resource_id=?2 AND owner_user_id=?3').bind(String(input.versionId??''),id,owner).first<{id:string;version_resource_id:string}>();if(!version)throw Error('Version not found.');versionId=version.id;sourceId=version.version_resource_id;}
  else {sourceId=String(input.sourceId??'');const source=await ownedFile(owner,'upload:'+sourceId,db);if(source.row.visibility!=='private')throw Error('Replacement must be your private file.');versionId=crypto.randomUUID();}
  await db.batch([db.prepare('INSERT OR IGNORE INTO resource_file_versions(id,owner_user_id,resource_id,version_resource_id) VALUES(?1,?2,?3,?3)').bind(crypto.randomUUID(),owner,id),db.prepare('UPDATE resource_file_versions SET active=0 WHERE resource_id=?1 AND owner_user_id=?2').bind(id,owner),db.prepare('INSERT OR IGNORE INTO resource_file_versions(id,owner_user_id,resource_id,version_resource_id) VALUES(?1,?2,?3,?4)').bind(versionId,owner,id,sourceId),db.prepare('UPDATE resource_file_versions SET active=1 WHERE resource_id=?1 AND version_resource_id=?2 AND owner_user_id=?3').bind(id,sourceId,owner),log(sourceId)]);
 }else throw Error('Unsupported file action.');
 results.push({key,ok:true});
 }catch(error){results.push({key,ok:false,error:workspaceErrorMessage(error)});}}
 return {results};
}
export async function versionStorage(resourceId:string,owner:string,db:HotD1Database=getHotD1Database()){
 return db.prepare("SELECT u.storage_bucket,u.storage_path,u.original_filename,u.mime_type,u.extension,u.size_bytes FROM resource_file_versions v JOIN uploaded_resources target ON target.id=v.resource_id JOIN uploaded_resources u ON u.id=v.version_resource_id WHERE v.resource_id=?1 AND v.owner_user_id=?2 AND v.active=1 AND target.owner_user_id=?2 AND u.owner_user_id=?2 AND target.visibility='private' AND u.visibility='private'").bind(resourceId,owner).first<Record<string,unknown>>();
}
