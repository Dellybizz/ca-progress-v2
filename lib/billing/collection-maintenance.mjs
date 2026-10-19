import {priceDecreaseStatements} from './commercial-transitions.mjs';
const terminal=new Set(['cancelled','completed','expired']);
export async function stopProviderRenewal(provider,local,atPeriodEnd) {
 let sub=await provider('subscriptions/'+local.provider_subscription_id);
 if(sub.id!==local.provider_subscription_id||sub.plan_id!==local.provider_plan_id||sub.notes?.ca_progress_user_id!==local.user_id)throw new Error('collection_subscription_identity_mismatch');
 const stopped=()=>terminal.has(sub.status)||(atPeriodEnd&&(sub.cancel_at_cycle_end===true||sub.cancel_at_cycle_end===1||(sub.remaining_count===0&&sub.charge_at==null)));
 if(!stopped()){
  await provider('subscriptions/'+sub.id+'/cancel',{method:'POST',body:JSON.stringify({cancel_at_cycle_end:atPeriodEnd?1:0})});
  sub=await provider('subscriptions/'+local.provider_subscription_id);
 }
 if(sub.id!==local.provider_subscription_id||sub.plan_id!==local.provider_plan_id||sub.notes?.ca_progress_user_id!==local.user_id||!stopped())throw new Error('collection_cancellation_pending');
 return sub;
}
export async function maintainCollectionDeadlines(db,provider,now=new Date().toISOString(),sync=null) {
 const rows=await db.prepare(`SELECT s.*,strftime('%Y-%m-%dT%H:%M:%fZ',COALESCE(s.grace_until,s.failure_paid_through_at),'+7 days') recovery_deadline
 FROM razorpay_subscriptions s WHERE s.failure_paid_through_at IS NOT NULL AND s.financial_state NOT IN ('refunded','disputed','mismatch')
 AND s.cancel_at_period_end=0 AND s.status IN ('active','pending','halted')
 AND julianday(COALESCE(s.grace_until,s.failure_paid_through_at))+7<=julianday(?1)
 AND NOT EXISTS(SELECT 1 FROM subscription_collection_stops stop WHERE stop.source_subscription_id=s.id AND stop.confirmed_at IS NOT NULL)
 ORDER BY s.failure_paid_through_at LIMIT 20`).bind(now).all();
 for(const row of rows.results??[]){
  await db.prepare('INSERT INTO subscription_collection_stops(source_subscription_id,deadline_at) VALUES(?1,?2) ON CONFLICT(source_subscription_id) DO UPDATE SET deadline_at=excluded.deadline_at WHERE subscription_collection_stops.confirmed_at IS NULL').bind(row.id,row.recovery_deadline).run();
  const token=crypto.randomUUID();const claimed=await db.prepare('UPDATE subscription_collection_stops SET lease_token=?1,lease_until=?2 WHERE source_subscription_id=?3 AND confirmed_at IS NULL AND (lease_token IS NULL OR lease_until<=?4)').bind(token,new Date(Date.parse(now)+300000).toISOString(),row.id,now).run();
  if(Number(claimed.meta?.changes)!==1)continue;
  try{
   const fresh=await db.prepare('SELECT * FROM razorpay_subscriptions WHERE id=?1').bind(row.id).first();
   if(fresh.failure_paid_through_at!==row.failure_paid_through_at||fresh.financial_state!==row.financial_state)continue;
   const remote=await provider('subscriptions/'+row.provider_subscription_id);
   if(remote.id!==row.provider_subscription_id||remote.plan_id!==row.provider_plan_id||remote.notes?.ca_progress_user_id!==row.user_id)throw new Error('collection_subscription_identity_mismatch');
   if(Number(remote.paid_count??0)>Number(row.paid_count)){if(sync)await sync(row.provider_subscription_id,row.user_id);continue;}
   const sub=await stopProviderRenewal(provider,row,false);
   await db.batch([db.prepare('UPDATE subscription_collection_stops SET confirmed_at=?1,last_error=NULL WHERE source_subscription_id=?2 AND lease_token=?3').bind(now,row.id,token),db.prepare('UPDATE razorpay_subscriptions SET status=?1,cancel_at_period_end=0,provider_verified=1,provider_state_json=?2,updated_at=?3 WHERE id=?4').bind(sub.status,JSON.stringify(sub),now,row.id)]);
  }catch(error){await db.prepare('UPDATE subscription_collection_stops SET last_error=?1 WHERE source_subscription_id=?2 AND lease_token=?3').bind(error.message,row.id,token).run();}
  finally{await db.prepare('UPDATE subscription_collection_stops SET lease_token=NULL,lease_until=NULL WHERE source_subscription_id=?1 AND lease_token=?2').bind(row.id,token).run();}
 }
}
export async function maintainCommercialChanges(db,provider,sync,now=new Date().toISOString()) {
 const published=await db.prepare(`SELECT pv.id,pv.plan_id,pv.price_subunits,pv.created_by FROM plan_policy_versions pv JOIN subscription_plans sp ON sp.id=pv.plan_id WHERE sp.tier_key<>'free' AND NOT EXISTS(SELECT 1 FROM plan_availability_policies availability WHERE availability.plan_id=sp.id AND availability.mode='retire') AND pv.state='published' AND (pv.effective_at IS NULL OR pv.effective_at<=?1)
 AND pv.id=(SELECT id FROM plan_policy_versions WHERE plan_id=pv.plan_id AND state='published' AND (effective_at IS NULL OR effective_at<=?1) ORDER BY COALESCE(effective_at,published_at,created_at) DESC,version DESC LIMIT 1)`).bind(now).all();
 for(const policy of published.results??[])await db.batch(priceDecreaseStatements(db,{planId:policy.plan_id,policyId:policy.id,priceSubunits:Number(policy.price_subunits),actorId:policy.created_by??null,reason:'Effective published price decrease',now}));

 const rows=await db.prepare("SELECT j.*,s.provider_subscription_id,s.provider_plan_id,s.paid_count,s.paid_through_at,s.current_start,s.status,s.financial_state,s.plan_id FROM subscription_policy_change_jobs j JOIN razorpay_subscriptions s ON s.id=j.source_subscription_id WHERE j.state='pending' ORDER BY j.created_at LIMIT 20").all();
 for(const row of rows.results??[]){
  const token=crypto.randomUUID();const claim=await db.prepare("UPDATE subscription_policy_change_jobs SET lease_token=?1,lease_until=?2 WHERE id=?3 AND state='pending' AND (lease_token IS NULL OR lease_until<=?4)").bind(token,new Date(Date.parse(now)+300000).toISOString(),row.id,now).run();if(Number(claim.meta?.changes)!==1)continue;
  try{
   const local={...row,id:row.source_subscription_id};
   await db.prepare(`INSERT INTO subscription_cancel_intents(source_subscription_id,user_id,reason,boundary_at,paid_count_before,paid_start_before,requested_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(source_subscription_id) DO NOTHING`).bind(local.id,row.user_id,row.kind,row.effective_at,Number(row.paid_count),row.current_start,row.created_at).run();
   const sub=await stopProviderRenewal(provider,local,Number(row.paid_count)>0);
   await db.batch([
    db.prepare('UPDATE subscription_cancel_intents SET provider_confirmed_at=?1 WHERE source_subscription_id=?2').bind(now,local.id),
    db.prepare('UPDATE razorpay_subscriptions SET status=?1,cancel_at_period_end=1,provider_verified=1,provider_state_json=?2,updated_at=?3 WHERE id=?4').bind(sub.status,JSON.stringify(sub),now,local.id),
    db.prepare("UPDATE subscription_policy_change_jobs SET state=?1,last_error=NULL,updated_at=?2 WHERE id=?3 AND lease_token=?4").bind(row.kind==='price_decrease'?'awaiting_approval':'applied',now,row.id,token),
   ]);
   await sync(row.provider_subscription_id,row.user_id);
  }catch(error){await db.prepare('UPDATE subscription_policy_change_jobs SET last_error=?1,updated_at=?2 WHERE id=?3 AND lease_token=?4').bind(error.message,now,row.id,token).run();}
  finally{await db.prepare('UPDATE subscription_policy_change_jobs SET lease_token=NULL,lease_until=NULL WHERE id=?1 AND lease_token=?2').bind(row.id,token).run();}
 }
 const replacements=await db.prepare("SELECT r.*,j.source_subscription_id,j.user_id FROM commercial_checkout_replacements r JOIN subscription_policy_change_jobs j ON j.id=r.job_id WHERE j.state='awaiting_approval' AND r.provider_subscription_id IS NOT NULL AND EXISTS(SELECT 1 FROM razorpay_subscriptions s WHERE s.provider_subscription_id=r.provider_subscription_id AND s.financial_state='paid' AND s.provider_verified=1 AND s.paid_count>0 AND julianday(s.paid_through_at)>julianday(?1) AND EXISTS(SELECT 1 FROM user_subscriptions active WHERE active.provider_subscription_id=s.provider_subscription_id AND active.status IN ('active','paused','cancelled') AND julianday(active.starts_at)<=julianday(?1) AND julianday(active.ends_at)>julianday(?1)))").bind(now).all();
 for(const row of replacements.results??[]){await db.batch([db.prepare("UPDATE subscription_policy_change_jobs SET state='applied',updated_at=?1 WHERE id=?2 AND state='awaiting_approval'").bind(now,row.job_id),db.prepare("UPDATE user_subscriptions SET status='expired',updated_at=?1 WHERE provider_subscription_id=(SELECT provider_subscription_id FROM razorpay_subscriptions WHERE id=?2)").bind(now,row.source_subscription_id)]);}
}

export async function maintainRequestedCancellations(db,provider,now=new Date().toISOString()){
 const rows=await db.prepare("SELECT s.*,c.requested_at FROM subscription_cancel_intents c JOIN razorpay_subscriptions s ON s.id=c.source_subscription_id WHERE c.reason='user_grace' AND c.provider_confirmed_at IS NULL ORDER BY c.requested_at LIMIT 20").all();
 for(const row of rows.results??[]){try{const sub=await stopProviderRenewal(provider,row,false);await db.batch([db.prepare('UPDATE subscription_cancel_intents SET provider_confirmed_at=?1 WHERE source_subscription_id=?2').bind(now,row.id),db.prepare('UPDATE razorpay_subscriptions SET status=?1,cancel_at_period_end=0,updated_at=?2 WHERE id=?3').bind(sub.status,now,row.id)]);}catch{/* Intent remains durable; reconciliation refunds any raced renewal. */}}
}
