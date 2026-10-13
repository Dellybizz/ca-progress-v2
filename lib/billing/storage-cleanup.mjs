const DAY=86400000;
const ACTIVE="('grace','processing','review')";
const nowIso=()=>new Date().toISOString();
const addDays=(time,days)=>new Date(Date.parse(time)+days*DAY).toISOString();
const number=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('storage_number_invalid');return n;};
export function cleanupSelection(files,limitBytes,effectiveAt){
 const limit=number(limitBytes),grace=Math.floor(limit/10),importantLimit=limit+grace;
 const normalize=f=>({...f,size_bytes:number(f.size_bytes),protected:Boolean(f.important)&&Date.parse(f.created_at)<=Date.parse(effectiveAt)});
 const rows=files.map(normalize);let total=rows.reduce((sum,f)=>sum+f.size_bytes,0);if(!Number.isSafeInteger(total))throw new Error('storage_total_invalid');
 const normal=rows.filter(f=>!f.protected).sort((a,b)=>(a.last_opened_at?Date.parse(a.last_opened_at):-Infinity)-(b.last_opened_at?Date.parse(b.last_opened_at):-Infinity)||Date.parse(a.created_at)-Date.parse(b.created_at)||`${a.file_kind}:${a.file_id}`.localeCompare(`${b.file_kind}:${b.file_id}`));
 const important=rows.filter(f=>f.protected).sort((a,b)=>b.size_bytes-a.size_bytes||`${a.file_kind}:${a.file_id}`.localeCompare(`${b.file_kind}:${b.file_id}`));
 const selected=[];
 for(const f of normal){if(total<=limit)break;selected.push(f);total-=f.size_bytes;}
 for(const f of important){if(total<=importantLimit)break;selected.push(f);total-=f.size_bytes;}
 return {selected,remainingBytes:total,importantLimitBytes:importantLimit,usedBytes:rows.reduce((sum,f)=>sum+f.size_bytes,0)};
}
export async function storageFiles(db,user){
 const result=await db.prepare(`SELECT 'resource' file_kind,r.id file_id,r.storage_path object_key,r.storage_bucket,r.owner_user_id user_id,r.size_bytes,r.created_at,a.last_opened_at,CASE WHEN i.resource_id IS NOT NULL THEN 1 ELSE 0 END important
 FROM uploaded_resources r LEFT JOIN resource_importance i ON i.resource_id=r.id AND i.owner_user_id=r.owner_user_id LEFT JOIN storage_file_activity a ON a.file_kind='resource' AND a.file_id=r.id AND a.user_id=r.owner_user_id WHERE r.owner_user_id=?1
 UNION ALL SELECT 'test_attachment',r.id,r.object_key,NULL,r.user_id,r.size_bytes,r.created_at,a.last_opened_at,CASE WHEN i.attachment_id IS NOT NULL THEN 1 ELSE 0 END
 FROM test_attempt_attachments r LEFT JOIN test_attachment_importance i ON i.attachment_id=r.id AND i.user_id=r.user_id LEFT JOIN storage_file_activity a ON a.file_kind='test_attachment' AND a.file_id=r.id AND a.user_id=r.user_id WHERE r.user_id=?1`).bind(user).all();return result.results??[];
}
export async function touchStorageFile(db,kind,id,user,time=nowIso()){
 const claim=await db.prepare("SELECT 1 FROM storage_cleanup_deletions WHERE file_kind=?1 AND file_id=?2 AND state IN ('deleting','deleted','review')").bind(kind,id).first();if(claim)return false;
 const table=kind==='resource'?'uploaded_resources':kind==='test_attachment'?'test_attempt_attachments':null;if(!table)throw new Error('storage_kind_invalid');
 const owner=kind==='resource'?'owner_user_id':'user_id';
 await db.prepare(`INSERT INTO storage_file_activity(file_kind,file_id,user_id,last_opened_at) SELECT ?1,id,${owner},?2 FROM ${table} WHERE id=?3 AND ${owner}=?4
 ON CONFLICT(file_kind,file_id) DO UPDATE SET last_opened_at=excluded.last_opened_at WHERE user_id=excluded.user_id`).bind(kind,time,id,user).run();return true;
}
export async function setStorageImportance(db,kind,id,user,important){
 if(typeof important!=='boolean')throw new Error('storage_importance_invalid');
 const table=kind==='resource'?'uploaded_resources':kind==='test_attachment'?'test_attempt_attachments':null;if(!table)throw new Error('storage_kind_invalid');
 const owner=kind==='resource'?'owner_user_id':'user_id',flag=kind==='resource'?'resource_importance':'test_attachment_importance',ref=kind==='resource'?'resource_id':'attachment_id',flagOwner=kind==='resource'?'owner_user_id':'user_id';
 const found=await db.prepare(`SELECT id FROM ${table} WHERE id=?1 AND ${owner}=?2 AND NOT EXISTS(SELECT 1 FROM storage_cleanup_deletions d WHERE d.file_kind=?3 AND d.file_id=?1 AND d.state IN ('deleting','deleted','review'))`).bind(id,user,kind).first();if(!found)return false;
 if(important)await db.prepare(`INSERT OR IGNORE INTO ${flag}(${ref},${flagOwner}) SELECT id,${owner} FROM ${table} WHERE id=?1 AND ${owner}=?2 AND NOT EXISTS(SELECT 1 FROM storage_cleanup_deletions d WHERE d.file_kind=?3 AND d.file_id=?1 AND d.state IN ('deleting','deleted','review'))`).bind(id,user,kind).run();
 else await db.prepare(`DELETE FROM ${flag} WHERE ${ref}=?1 AND ${flagOwner}=?2 AND NOT EXISTS(SELECT 1 FROM storage_cleanup_deletions d WHERE d.file_kind=?3 AND d.file_id=?1 AND d.state IN ('deleting','deleted','review'))`).bind(id,user,kind).run();return true;
}
export async function cleanupStatus(db,user){
 const row=await db.prepare(`SELECT t.*,(SELECT COUNT(*) FROM storage_cleanup_deletions d WHERE d.transition_id=t.id AND d.state='deleted') deleted_count FROM subscription_storage_transitions t WHERE t.user_id=?1 AND t.state IN ${ACTIVE} ORDER BY t.created_at DESC LIMIT 1`).bind(user).first();
 if(!row)return null;const files=await storageFiles(db,user);const choice=cleanupSelection(files,row.limit_bytes,row.effective_at);
 return {id:row.id,deadline:row.deadline,state:row.state,usedBytes:choice.usedBytes,limitBytes:Number(row.limit_bytes),importantLimitBytes:choice.importantLimitBytes,excessBytes:Math.max(0,choice.usedBytes-Number(row.limit_bytes)),filesToDelete:choice.selected.length,deletedCount:Number(row.deleted_count),lastError:row.last_error??null};
}
async function suppress(db,id,time){await db.prepare("UPDATE storage_cleanup_email_outbox SET state='suppressed',last_error=NULL WHERE transition_id=?1 AND state IN ('pending','review') AND (lease_token IS NULL OR lease_until<?2)").bind(id,time).run();}
async function finish(db,row,state,time){await db.prepare('UPDATE subscription_storage_transitions SET state=?1,last_error=NULL WHERE id=?2').bind(state,row.id).run();await suppress(db,row.id,time);}
async function warnings(db,row){
 for(const [kind,days] of [['scheduled',7],['three_days',3],['one_day',1]])await db.prepare('INSERT OR IGNORE INTO storage_cleanup_email_outbox(id,transition_id,user_id,warning_kind,due_at,request_key) VALUES(?1,?2,?3,?4,?5,?6)').bind(crypto.randomUUID(),row.id,row.user_id,kind,addDays(row.deadline,-days),`storage_${row.id}_${kind}`).run();
}
function safeObject(file,user,bucketName){
 const prefix=file.file_kind==='resource'?`uploads/${user}/`:`test-attempts/${user}/`;
 return (file.file_kind!=='resource'||file.storage_bucket===`r2:${bucketName}`)&&typeof file.object_key==='string'&&file.object_key.startsWith(prefix)&&!file.object_key.split('/').some(part=>part==='..'||part==='.')&&!file.object_key.includes('\\');
}
async function finalizeDeletion(db,row,time){
 const table=row.file_kind==='resource'?'uploaded_resources':'test_attempt_attachments',owner=row.file_kind==='resource'?'owner_user_id':'user_id',key=row.file_kind==='resource'?'storage_path':'object_key';
 await db.batch([
  db.prepare(`DELETE FROM ${table} WHERE id=?1 AND ${owner}=?2 AND ${key}=?3`).bind(row.file_id,row.user_id,row.object_key),
  db.prepare('DELETE FROM storage_file_activity WHERE file_kind=?1 AND file_id=?2 AND user_id=?3').bind(row.file_kind,row.file_id,row.user_id),
  db.prepare("UPDATE storage_cleanup_deletions SET state='deleted',deleted_at=?1,last_error=NULL WHERE id=?2 AND user_id=?3 AND object_key=?4").bind(time,row.id,row.user_id,row.object_key)
 ]);
}
async function settlePending(db,user,deps,time){
 const rows=await db.prepare("SELECT * FROM storage_cleanup_deletions WHERE user_id=?1 AND state='deleting' ORDER BY claimed_at LIMIT 20").bind(user).all();
 if(rows.results?.length&&!deps.bucket?.head)throw new Error('storage_object_recovery_unavailable');
 for(const row of rows.results??[]){const object=await deps.bucket.head(row.object_key);if(!object)await finalizeDeletion(db,row,time);}
}
async function processOwner(db,user,deps,time){
 const access=await deps.access(user);if(!access?.planId)throw new Error('storage_entitlement_unavailable');const limit=number(access.limitBytes);
 await db.prepare('INSERT OR IGNORE INTO storage_quota_state(user_id,plan_id,limit_bytes,policy_version_id,last_checked_at) VALUES(?1,?2,?3,?4,?5)').bind(user,access.planId,limit,access.policyVersionId??null,time).run();
 const token=crypto.randomUUID(),lock=await db.prepare('UPDATE storage_quota_state SET lease_token=?1,lease_until=?2 WHERE user_id=?3 AND (lease_token IS NULL OR lease_until<?4)').bind(token,addDays(time,1/288),user,time).run();if(Number(lock.meta?.changes)!==1)return;
 try{
  await settlePending(db,user,deps,time);
  let row=await db.prepare(`SELECT * FROM subscription_storage_transitions WHERE user_id=?1 AND state IN ${ACTIVE} ORDER BY created_at DESC LIMIT 1`).bind(user).first();
  let files=await storageFiles(db,user),choice=cleanupSelection(files,limit,row?.effective_at??time);
  if(row&&(Number(row.limit_bytes)!==limit||row.target_plan_id!==access.planId)){
   if(limit>=choice.usedBytes){await finish(db,row,'cleared',time);row=null;}
   else if(limit<Number(row.limit_bytes)){await finish(db,row,'superseded',time);row=null;}
   else await db.prepare('UPDATE subscription_storage_transitions SET limit_bytes=?1,target_plan_id=?2 WHERE id=?3').bind(limit,access.planId,row.id).run();
  }
  if(choice.usedBytes<=limit){await db.prepare("UPDATE storage_cleanup_deletions SET state='cancelled' WHERE user_id=?1 AND state='deleting'").bind(user).run();if(row)await finish(db,row,'cleared',time);return;}
  if(!row){
   const previous=await db.prepare('SELECT limit_bytes FROM storage_quota_state WHERE user_id=?1').bind(user).first();
   if(!choice.selected.length&&Number(previous?.limit_bytes)===limit)return;
   row={id:crypto.randomUUID(),user_id:user,target_plan_id:access.planId,effective_at:time,deadline:addDays(time,7),limit_bytes:limit};
   await db.prepare("INSERT INTO subscription_storage_transitions(id,user_id,target_plan_id,reason,effective_at,deadline,limit_bytes,important_percent,state,policy_id,created_at) VALUES(?1,?2,?3,'downgrade',?4,?5,?6,10,'grace','owner-2026-10-13-storage',?4)").bind(row.id,user,access.planId,time,row.deadline,limit).run();
  }
  await warnings(db,row);
  if(Date.parse(time)<Date.parse(row.deadline))return;
  const pending=await db.prepare("SELECT COUNT(*) n FROM storage_cleanup_email_outbox WHERE transition_id=?1 AND state<>'sent'").bind(row.id).first();
  if(Number(pending?.n)>0){await db.prepare("UPDATE subscription_storage_transitions SET last_error='storage_warnings_not_sent' WHERE id=?1").bind(row.id).run();return;}
  if(!deps.bucket)throw new Error('storage_bucket_unavailable');
  await db.prepare("UPDATE subscription_storage_transitions SET state='processing',last_error=NULL WHERE id=?1").bind(row.id).run();
  for(let n=0;n<20;n++){
   // Re-read both verified access and latest markings before each irreversible claim.
   const fresh=await deps.access(user);const freshLimit=number(fresh.limitBytes);files=await storageFiles(db,user);choice=cleanupSelection(files,freshLimit,row.effective_at);
   if(freshLimit<limit){await finish(db,row,'superseded',time);return;}
   if(choice.usedBytes<=freshLimit){await finish(db,row,n>0?'completed':'cleared',time);return;}
   if(!choice.selected.length){await finish(db,row,'completed',time);return;}
   const file=choice.selected[0];if(!safeObject(file,user,deps.bucketName))throw new Error('storage_object_ownership_review');
   const existing=await db.prepare('SELECT * FROM storage_cleanup_deletions WHERE file_kind=?1 AND file_id=?2').bind(file.file_kind,file.file_id).first();
   if(existing&&existing.state==='deleted')throw new Error('storage_metadata_reappearance_review');
   const id=existing?.id??crypto.randomUUID();
   await db.prepare("INSERT INTO storage_cleanup_deletions(id,transition_id,user_id,file_kind,file_id,object_key,size_bytes,important_at_claim,state,claimed_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'deleting',?9) ON CONFLICT(file_kind,file_id) DO UPDATE SET state='deleting',transition_id=excluded.transition_id,last_error=NULL WHERE user_id=excluded.user_id AND object_key=excluded.object_key AND state IN ('deleting','cancelled','review')").bind(id,row.id,user,file.file_kind,file.file_id,file.object_key,file.size_bytes,file.protected?1:0,time).run();
   const receipt=await db.prepare('SELECT * FROM storage_cleanup_deletions WHERE id=?1 AND user_id=?2').bind(id,user).first();if(!receipt||receipt.object_key!==file.object_key||receipt.state!=='deleting')throw new Error('storage_deletion_identity_review');
   const lastAccess=await deps.access(user);const latestFiles=await storageFiles(db,user);const latest=cleanupSelection(latestFiles,number(lastAccess.limitBytes),row.effective_at);
   if(!latest.selected.some(f=>f.file_kind===file.file_kind&&f.file_id===file.file_id)){
    await db.prepare("UPDATE storage_cleanup_deletions SET state='cancelled' WHERE id=?1 AND state='deleting'").bind(id).run();continue;
   }
   try{await deps.bucket.delete(file.object_key);}catch{await db.prepare("UPDATE storage_cleanup_deletions SET last_error='storage_object_delete_pending' WHERE id=?1").bind(id).run();throw new Error('storage_object_delete_pending');}
   await finalizeDeletion(db,{...file,id,user_id:user},time);
  }
 }catch(error){await db.prepare(`UPDATE subscription_storage_transitions SET last_error=?1 WHERE user_id=?2 AND state IN ${ACTIVE}`).bind(error.message??'storage_cleanup_pending',user).run();}
 finally{await db.prepare('UPDATE storage_quota_state SET plan_id=?1,limit_bytes=?2,policy_version_id=?3,last_checked_at=?4,lease_token=NULL,lease_until=NULL WHERE user_id=?5 AND lease_token=?6').bind(access.planId,limit,access.policyVersionId??null,time,user,token).run();}
}
export async function maintainStorageCleanup(db,deps,time=nowIso(),user){
 const rows=user?[{user_id:user}]:((await db.prepare(`SELECT owners.user_id FROM (SELECT owner_user_id user_id FROM uploaded_resources UNION SELECT user_id FROM test_attempt_attachments UNION SELECT user_id FROM subscription_storage_transitions WHERE state IN ${ACTIVE}) owners LEFT JOIN storage_quota_state q ON q.user_id=owners.user_id ORDER BY q.last_checked_at,owners.user_id LIMIT 30`).all()).results??[]);
 for(const row of rows){try{await processOwner(db,row.user_id,deps,time);}catch(error){await db.prepare(`UPDATE subscription_storage_transitions SET last_error=?1 WHERE user_id=?2 AND state IN ${ACTIVE}`).bind(error.message??'storage_cleanup_pending',row.user_id).run();}}
}
