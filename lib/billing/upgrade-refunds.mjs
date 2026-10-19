// Provider idempotency and a DB lease protect uncertain refund retries.
export async function maintainUpgradeRefunds(db,deps,table="subscription_refund_obligations"){
 if(!["subscription_refund_obligations","subscription_switch_refunds","subscription_retry_refunds","subscription_cancellation_refunds"].includes(table))throw new Error("Invalid refund ledger.");
 const result=await db.prepare(`SELECT * FROM ${table} WHERE state IN ('pending','requested','failed','review') ORDER BY created_at LIMIT 20`).all();
 for(const row of result.results??[]){
  const token=crypto.randomUUID(),now=new Date().toISOString();
  const claimed=await db.prepare(`UPDATE ${table} SET lease_token=?1,lease_until=?2 WHERE payment_id=?3 AND (lease_token IS NULL OR lease_until<=?4)`).bind(token,new Date(Date.now()+300000).toISOString(),row.payment_id,now).run();if(Number(claimed.meta?.changes)!==1)continue;
  try{
   if(row.state==='review')continue;
   const payment=await deps.provider(`payments/${row.payment_id}`);
   if(payment.id!==row.payment_id||payment.status!=='captured'||payment.currency!==row.currency||Number(payment.amount)!==Number(row.amount_subunits))throw new Error('refund_payment_mismatch');
   const refunds=await deps.provider(`payments/${row.payment_id}/refunds?count=100`);
   if(!Array.isArray(refunds.items)||refunds.items.length>=100)throw new Error('refund_inventory_pending');
   let refund=refunds.items.find(r=>r.notes?.ca_progress_refund_request===row.request_key);
   if(refund?.status==='failed'){
    if(refund.payment_id!==row.payment_id||Number(refund.amount)!==Number(row.amount_subunits)||Number(payment.amount_refunded)>0)throw new Error('refund_failed_identity_mismatch');
    const n=Number(/_retry_(\d+)$/.exec(row.request_key)?.[1]??0)+1;
    row.request_key=row.request_key.replace(/_retry_\d+$/,'')+`_retry_${n}`;
    await db.prepare(`UPDATE ${table} SET request_key=?1,provider_refund_id=NULL WHERE payment_id=?2 AND lease_token=?3`).bind(row.request_key,row.payment_id,token).run();
    refund=null;
   }
   if(!refund&&Number(payment.amount_refunded)>=Number(row.amount_subunits)){
    await db.prepare(`UPDATE ${table} SET state='processed',last_error=NULL WHERE payment_id=?1 AND lease_token=?2`).bind(row.payment_id,token).run();continue;
   }
   if(!refund){
    if(Number(payment.amount_refunded)>0)throw new Error('refund_partial_review');
    await db.prepare(`UPDATE ${table} SET state='requested' WHERE payment_id=?1 AND lease_token=?2`).bind(row.payment_id,token).run();
    refund=await deps.provider(`payments/${row.payment_id}/refund`,{method:'POST',headers:{'X-Refund-Idempotency':row.request_key},body:JSON.stringify({amount:Number(row.amount_subunits),speed:'normal',notes:{ca_progress_refund_request:row.request_key,ca_progress_purchase_group_id:row.purchase_group_id}})});
   }
   if(!/^rfnd_[A-Za-z0-9]+$/.test(String(refund.id))||refund.payment_id!==row.payment_id||Number(refund.amount)!==Number(row.amount_subunits))throw new Error('refund_identity_mismatch');
   await db.prepare(`UPDATE ${table} SET state=?1,provider_refund_id=?2,last_error=?3 WHERE payment_id=?4 AND lease_token=?5`).bind(refund.status==='processed'?'processed':refund.status==='failed'?'failed':'requested',refund.id,refund.status==='failed'?'provider_refund_failed':null,row.payment_id,token).run();
  }catch(error){await db.prepare(`UPDATE ${table} SET state=?1,last_error=?2 WHERE payment_id=?3 AND lease_token=?4`).bind(/mismatch|partial_review/.test(error.message)?'review':'failed',error.message??'refund_pending',row.payment_id,token).run();}
  finally{
    await db.prepare(`UPDATE ${table} SET lease_token=NULL,lease_until=NULL WHERE payment_id=?1 AND lease_token=?2`).bind(row.payment_id,token).run();
    if(Date.now()-Date.parse(row.created_at)>=86400000){
      const current=await db.prepare(`SELECT state FROM ${table} WHERE payment_id=?1`).bind(row.payment_id).first();
      const key=`duplicate_refund:${table}:${row.payment_id}`;
      if(current?.state==='processed')await db.prepare("UPDATE billing_operational_alerts SET state='resolved',resolved_at=?2,updated_at=?2 WHERE alert_key=?1 AND state<>'resolved'").bind(key,now).run();
      else await db.prepare("INSERT INTO billing_operational_alerts(id,alert_key,alert_type,severity,state,message,created_at,updated_at) VALUES(?1,?2,'duplicate_refund_overdue','critical','open',?4,?3,?3) ON CONFLICT(alert_key) DO UPDATE SET state='open',updated_at=excluded.updated_at,resolved_at=NULL").bind(crypto.randomUUID(),key,now,`Duplicate payment ${row.payment_id}: full ${row.currency} ${(Number(row.amount_subunits)/100).toFixed(2)} refund unresolved for over 24 hours. Review the ${table} obligation.`).run();
    }
  }
 }
}
