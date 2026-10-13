import {CheckoutError} from './checkout-engine.mjs';
const terminal=s=>['cancelled','completed','expired'].includes(s);
const fail=code=>{throw new CheckoutError('Your scheduled downgrade is being verified. Your paid access is preserved.',code);};
const identity=(sub,local,user)=>sub.id===local.provider_subscription_id&&sub.plan_id===local.provider_plan_id&&sub.notes?.ca_progress_user_id===user;
async function clearSchedule(db,row,time){
 await db.prepare('UPDATE razorpay_subscriptions SET scheduled_target_plan_id=NULL,scheduled_target_policy_version_id=NULL,scheduled_target_provider_plan_id=NULL,updated_at=?1 WHERE provider_subscription_id=?2 AND user_id=?3 AND scheduled_target_plan_id=?4').bind(time,row.source_subscription_id,row.user_id,row.target_plan_id).run();
}
async function closeTarget(db,provider,row,time){
 if(!row.target_subscription_id){
  const attempt=await db.prepare('SELECT state FROM payment_checkout_attempts WHERE request_key=?1 AND user_id=?2').bind(row.request_key,row.user_id).first();
  if(attempt&&!['failed','cancelled'].includes(attempt.state))fail('switch_creation_pending');
 }else{
  const local=await db.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(row.target_subscription_id,row.user_id).first();
  const sub=await provider('subscriptions/'+row.target_subscription_id);
  if(!local||!identity(sub,local,row.user_id)||sub.notes?.checkout_key!==row.request_key||Number(sub.paid_count)!==0)fail('switch_reversal_payment_pending');
  if(!terminal(sub.status))await provider('subscriptions/'+sub.id+'/cancel',{method:'POST',body:JSON.stringify({cancel_at_cycle_end:0})});
  const checked=await provider('subscriptions/'+sub.id);
  if(!identity(checked,local,row.user_id)||!terminal(checked.status)||Number(checked.paid_count)!==0)fail('switch_reversal_confirmation_pending');
  await db.batch([
   db.prepare("UPDATE razorpay_subscriptions SET status=?1,provider_state_json=?2,updated_at=?3 WHERE provider_subscription_id=?4 AND user_id=?5").bind(checked.status,JSON.stringify(checked),time,sub.id,row.user_id),
   db.prepare("UPDATE payment_checkout_attempts SET state='cancelled',updated_at=?1 WHERE request_key=?2 AND user_id=?3").bind(time,row.request_key,row.user_id)
  ]);
 }
 await clearSchedule(db,row,time);
 await db.prepare("UPDATE subscription_checkout_switches SET state='cancelled',last_error=NULL,updated_at=?1 WHERE request_key=?2 AND lease_token=?3").bind(time,row.request_key,row.lease_token).run();
}
export async function maintainScheduledSwitch(db,provider,row,token,time){
 row={...row,lease_token:token};
 if(row.reversal_requested_at){await closeTarget(db,provider,row,time);return;}
 if(['failed','cancelled'].includes(row.attempt_state)){
  await clearSchedule(db,row,time);
  await db.prepare("UPDATE subscription_checkout_switches SET state='cancelled',updated_at=?1 WHERE request_key=?2 AND lease_token=?3").bind(time,row.request_key,token).run();return;
 }
 if(!row.target_subscription_id)return;
 const local=await db.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2 AND plan_id=?3').bind(row.target_subscription_id,row.user_id,row.target_plan_id).first();
 if(!local||Number(local.provider_verified)!==1||['mismatch','disputed','refunded'].includes(local.financial_state))return;
 const target=await provider('subscriptions/'+row.target_subscription_id);
 if(!identity(target,local,row.user_id)||target.notes?.checkout_key!==row.request_key||Number(target.start_at)!==Math.floor(Date.parse(row.effective_at)/1000))fail('switch_target_mismatch');
 if(terminal(target.status)&&row.state!=='closing_source'){
  await clearSchedule(db,row,time);
  await db.prepare("UPDATE subscription_checkout_switches SET state='cancelled',updated_at=?1 WHERE request_key=?2 AND lease_token=?3").bind(time,row.request_key,token).run();return;
 }
 // A ready checkout is not authorization. The provider must confirm the fresh mandate.
 if(!row.approved_at&&!['authenticated','active'].includes(target.status))return;
 const sourceLocal=await db.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(row.source_subscription_id,row.user_id).first();
 const source=await provider('subscriptions/'+row.source_subscription_id);
 if(!sourceLocal||!identity(source,sourceLocal,row.user_id)||source.plan_id!==row.source_provider_plan_id)fail('switch_source_owner');
 if(Date.parse(time)<Date.parse(row.effective_at)){
  if(source.status!=='active'||Number(sourceLocal.cancel_at_period_end)===1){await db.prepare('UPDATE subscription_checkout_switches SET reversal_requested_at=COALESCE(reversal_requested_at,?1) WHERE request_key=?2 AND lease_token=?3').bind(time,row.request_key,token).run();await closeTarget(db,provider,row,time);return;}
  await db.batch([
   db.prepare('UPDATE subscription_checkout_switches SET approved_at=COALESCE(approved_at,?1),last_error=NULL,updated_at=?1 WHERE request_key=?2 AND lease_token=?3').bind(time,row.request_key,token),
   db.prepare('UPDATE razorpay_subscriptions SET scheduled_target_plan_id=?1,scheduled_target_policy_version_id=?2,scheduled_target_provider_plan_id=?3,updated_at=?4 WHERE provider_subscription_id=?5 AND user_id=?6').bind(row.target_plan_id,local.policy_version_id,local.provider_plan_id,time,row.source_subscription_id,row.user_id)
  ]);return;
 }
 // No source debit is stopped until the fresh mandate has been confirmed.
 await db.prepare("UPDATE subscription_checkout_switches SET approved_at=COALESCE(approved_at,?1),state='closing_source',updated_at=?1 WHERE request_key=?2 AND lease_token=?3").bind(time,row.request_key,token).run();
 if(!terminal(source.status))await provider('subscriptions/'+source.id+'/cancel',{method:'POST',body:JSON.stringify({cancel_at_cycle_end:0})});
 const checked=await provider('subscriptions/'+source.id);
 if(!identity(checked,sourceLocal,row.user_id)||!terminal(checked.status))fail('switch_source_closure_pending');
 await db.batch([
  db.prepare('UPDATE razorpay_subscriptions SET status=?1,cancel_at_period_end=0,grace_until=NULL,paid_through_at=?2,paid_count=?3,provider_state_json=?4,updated_at=?5 WHERE provider_subscription_id=?6 AND user_id=?7').bind(checked.status,row.effective_at,row.source_paid_count,JSON.stringify(checked),time,row.source_subscription_id,row.user_id),
  db.prepare("UPDATE user_subscriptions SET ends_at=?1,status='cancelled',updated_at=?2 WHERE provider_subscription_id=?3 AND user_id=?4 AND julianday(ends_at)>julianday(?1)").bind(row.effective_at,time,row.source_subscription_id,row.user_id)
 ]);
 const paid=await db.prepare("SELECT 1 FROM payment_subscription_cycles c JOIN user_subscriptions u ON u.provider_subscription_id=c.provider_subscription_id WHERE c.provider_subscription_id=?1 AND c.status='verified' AND u.user_id=?2 AND u.starts_at<=?3 AND u.ends_at>?3 AND u.status='active'").bind(row.target_subscription_id,row.user_id,time).first();
 if(paid||terminal(target.status)){await clearSchedule(db,row,time);await db.prepare("UPDATE subscription_checkout_switches SET state='completed',last_error=NULL,updated_at=?1 WHERE request_key=?2 AND lease_token=?3").bind(time,row.request_key,token).run();}
}
export async function reverseScheduledSwitch(db,provider,user,sourceId){
 const row=await db.prepare("SELECT x.*,a.provider_subscription_id discovered_target FROM subscription_checkout_switches x LEFT JOIN payment_checkout_attempts a ON a.request_key=x.request_key AND a.user_id=x.user_id WHERE x.source_subscription_id=?1 AND x.user_id=?2 AND x.switch_kind='downgrade' AND x.state IN ('pending','closing_source')").bind(sourceId,user).first();
 if(!row)return false;
 if(row.state!=='pending'||Date.parse(row.effective_at)<=Date.now())fail('switch_reversal_boundary_passed');
 const token=crypto.randomUUID(),time=new Date().toISOString();
 const lock=await db.prepare("UPDATE subscription_checkout_switches SET lease_token=?1,lease_until=?2,reversal_requested_at=COALESCE(reversal_requested_at,?3) WHERE request_key=?4 AND state='pending' AND (lease_token IS NULL OR lease_until<?3)").bind(token,new Date(Date.now()+300000).toISOString(),time,row.request_key).run();
 if(Number(lock.meta?.changes)!==1)fail('switch_in_progress');
 try{
  const local=await db.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(sourceId,user).first();
  const source=await provider('subscriptions/'+sourceId);
  if(!local||!identity(source,local,user)||source.status!=='active')fail('switch_source_changed');
  await closeTarget(db,provider,{...row,target_subscription_id:row.target_subscription_id??row.discovered_target,lease_token:token},time);return true;
 }finally{await db.prepare('UPDATE subscription_checkout_switches SET lease_token=NULL,lease_until=NULL WHERE request_key=?1 AND lease_token=?2').bind(row.request_key,token).run();}
}
// Reconciliation of an old debit cannot extend access after a scheduled replacement.
export async function enforceScheduledSwitchBoundary(db,local,evidence){
 const row=await db.prepare("SELECT * FROM subscription_checkout_switches WHERE source_subscription_id=?1 AND user_id=?2 AND state IN ('closing_source','completed') AND effective_at IS NOT NULL AND (switch_kind='immediate' OR approved_at IS NOT NULL) ORDER BY created_at DESC LIMIT 1").bind(local.provider_subscription_id,local.user_id).first();
 if(!row)return evidence;
 const cycles=await db.prepare("SELECT * FROM payment_subscription_cycles WHERE razorpay_subscription_id=?1 AND status='verified' AND julianday(starts_at)>=julianday(?2)").bind(local.id,row.effective_at).all();
 if(row.switch_kind==='downgrade'&&cycles.results?.length)await db.batch(cycles.results.map(c=>db.prepare("INSERT OR IGNORE INTO subscription_cancellation_refunds(payment_id,purchase_group_id,amount_subunits,currency,state,request_key) VALUES(?1,?2,?3,?4,'pending',?5)").bind(c.provider_payment_id,local.id,c.amount_subunits,c.currency,'cancelled_renewal_'+c.provider_payment_id)));
 return {...evidence,paidCount:Number(row.source_paid_count),paidThrough:row.effective_at,latestPaidStart:row.source_paid_start,forcePaidBoundary:true,firstCycleVerified:true};
}
