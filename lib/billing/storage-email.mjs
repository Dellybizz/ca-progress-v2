export function storageEmailSender(env,request=fetch){
 return async(payload,key)=>{
  if(!env.RESEND_API_KEY||!env.STORAGE_CLEANUP_EMAIL_FROM)throw new Error('storage_email_not_configured');
  const response=await request('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('storage_email_http_'+response.status);
  const result=await response.json();if(typeof result?.id!=='string'||!result.id||result.id.length>200)throw new Error('storage_email_receipt_invalid');return result.id;
 };
}
export async function maintainStorageEmails(db,send,from,time=new Date().toISOString()){
 const rows=await db.prepare("SELECT e.*,t.deadline,t.limit_bytes,t.state transition_state FROM storage_cleanup_email_outbox e JOIN subscription_storage_transitions t ON t.id=e.transition_id WHERE e.state='pending' AND e.due_at<=?1 AND (e.lease_token IS NULL OR e.lease_until<?1) ORDER BY COALESCE(e.last_attempt_at,''),e.due_at,e.id LIMIT 30").bind(time).all();
 for(const row of rows.results??[]){
  if(!['grace','processing','review'].includes(row.transition_state)){await db.prepare("UPDATE storage_cleanup_email_outbox SET state='suppressed' WHERE id=?1 AND state='pending'").bind(row.id).run();continue;}
  if(row.first_dispatched_at&&Date.parse(time)-Date.parse(row.first_dispatched_at)>=86400000){await db.prepare("UPDATE storage_cleanup_email_outbox SET state='review',last_error='storage_email_delivery_uncertain' WHERE id=?1").bind(row.id).run();continue;}
  if(!row.first_dispatched_at&&Date.parse(time)-Date.parse(row.due_at)>6*3600000){await db.prepare("UPDATE storage_cleanup_email_outbox SET state='review',last_error='storage_warning_schedule_missed' WHERE id=?1 AND state='pending'").bind(row.id).run();continue;}
  const token=crypto.randomUUID();const lock=await db.prepare("UPDATE storage_cleanup_email_outbox SET lease_token=?1,lease_until=?2,last_attempt_at=?4 WHERE id=?3 AND state='pending' AND (lease_token IS NULL OR lease_until<?4)").bind(token,new Date(Date.parse(time)+60000).toISOString(),row.id,time).run();if(Number(lock.meta?.changes)!==1)continue;
  try{
   let payload=row.payload_json?JSON.parse(row.payload_json):null;
   if(!payload){
    if(!from)throw new Error('storage_email_not_configured');
    const identity=await db.prepare("SELECT email FROM auth_identities WHERE application_user_id=?1 AND email_verified=1 AND email IS NOT NULL ORDER BY COALESCE(last_seen_at,updated_at) DESC LIMIT 1").bind(row.user_id).first();
    if(!identity?.email||!/^\S+@\S+\.\S+$/.test(identity.email))throw new Error('storage_verified_email_unavailable');
    payload={from,to:[identity.email],subject:row.warning_kind==='scheduled'?'CA Progress: storage cleanup in seven days':row.warning_kind==='three_days'?'CA Progress: storage cleanup in three days':'CA Progress: storage cleanup tomorrow',text:`Your current storage allowance is ${Number(row.limit_bytes)} bytes. Excess files are scheduled for permanent deletion at ${row.deadline}. Download or delete files from Resources and Test Archive, or upgrade before cleanup begins. Normal files are deleted least recently opened first. Already-uploaded important files have a 10% extra allowance; largest important files are removed first if that allowance is exceeded. You may change important markings during the warning period. New uploads are blocked while usage exceeds the normal limit. Deleted files cannot be recovered.`};
    await db.prepare('UPDATE storage_cleanup_email_outbox SET payload_json=?1 WHERE id=?2 AND lease_token=?3').bind(JSON.stringify(payload),row.id,token).run();
   }
   const current=await db.prepare('SELECT state FROM subscription_storage_transitions WHERE id=?1 AND user_id=?2').bind(row.transition_id,row.user_id).first();
   if(!current||!['grace','processing','review'].includes(current.state)){await db.prepare("UPDATE storage_cleanup_email_outbox SET state='suppressed' WHERE id=?1 AND lease_token=?2").bind(row.id,token).run();continue;}
   // Missing setup must not consume the provider's 24-hour uncertainty window.
   await db.prepare('UPDATE storage_cleanup_email_outbox SET first_dispatched_at=COALESCE(first_dispatched_at,?1) WHERE id=?2 AND lease_token=?3').bind(time,row.id,token).run();
   const id=await send(payload,row.request_key);
   await db.prepare("UPDATE storage_cleanup_email_outbox SET state='sent',provider_email_id=?1,sent_at=?2,last_error=NULL WHERE id=?3 AND lease_token=?4").bind(id,time,row.id,token).run();
  }catch(error){
   const knownMissing=['storage_email_not_configured','storage_verified_email_unavailable'].includes(error.message);
   await db.prepare('UPDATE storage_cleanup_email_outbox SET last_error=?1,first_dispatched_at=CASE WHEN ?2=1 THEN NULL ELSE first_dispatched_at END WHERE id=?3 AND lease_token=?4').bind(error.message??'storage_email_pending',knownMissing?1:0,row.id,token).run();
  }finally{await db.prepare('UPDATE storage_cleanup_email_outbox SET lease_token=NULL,lease_until=NULL WHERE id=?1 AND lease_token=?2').bind(row.id,token).run();}
 }
}
