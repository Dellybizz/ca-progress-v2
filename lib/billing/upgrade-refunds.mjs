// Provider idempotency and a DB lease protect uncertain refund retries.
export async function maintainUpgradeRefunds(db,deps,table="subscription_refund_obligations"){
 if(!["subscription_refund_obligations","subscription_switch_refunds"].includes(table))throw new Error("Invalid refund ledger.");
 const result=await db.prepare(`SELECT * FROM ${table} WHERE state IN ('pending','requested','failed') ORDER BY created_at LIMIT 20`).all();
 for(const row of result.results??[]){
  const token=crypto.randomUUID(),now=new Date().toISOString();
  const claimed=await db.prepare(`UPDATE ${table} SET lease_token=?1,lease_until=?2 WHERE payment_id=?3 AND (lease_token IS NULL OR lease_until<=?4)`).bind(token,new Date(Date.now()+300000).toISOString(),row.payment_id,now).run();if(Number(claimed.meta?.changes)!==1)continue;
  try{
   const payment=await deps.provider(`payments/${row.payment_id}`);
   if(payment.id!==row.payment_id||payment.status!=='captured'||payment.currency!==row.currency||Number(payment.amount)!==Number(row.amount_subunits))throw new Error('refund_payment_mismatch');
   const refunds=await deps.provider(`payments/${row.payment_id}/refunds?count=100`);
   if(!Array.isArray(refunds.items)||refunds.items.length>=100)throw new Error('refund_inventory_pending');
   let refund=refunds.items.find(r=>r.notes?.ca_progress_refund_request===row.request_key);
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
  finally{await db.prepare(`UPDATE ${table} SET lease_token=NULL,lease_until=NULL WHERE payment_id=?1 AND lease_token=?2`).bind(row.payment_id,token).run();}
 }
}
