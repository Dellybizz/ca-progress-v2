import {maintainUpgradeRefunds} from './upgrade-refunds.mjs';
import {maintainScheduledSwitch, reverseScheduledSwitch} from './scheduled-switch.mjs';
import {CheckoutError} from './checkout-engine.mjs';
const now=()=>new Date().toISOString();
const deny=(message,code)=>{throw new CheckoutError(message,code);};
// Creating the replacement does not authorize cancellation of the existing mandate.
export async function reserveSubscriptionSwitch(db,user,input,provider){
 const source=await db.prepare(`SELECT s.*,p.tier_key,p.billing_cycle source_billing_cycle FROM razorpay_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.provider_subscription_id=?1 AND s.user_id=?2`).bind(input.switchFromSubscriptionId,user).first();
 const target=await db.prepare('SELECT tier_key,billing_cycle FROM subscription_plans WHERE id=?1 AND active=1 AND checkout_enabled=1').bind(input.planId).first();
 const ranks={free:0,basic:1,pro:2};
 const downgrade=source?.tier_key==='pro'&&target?.tier_key==='basic';
 const immediate=source&&target&&ranks[target.tier_key]>=ranks[source.tier_key]&&(source.plan_id!==input.planId);
 if(!source||(!downgrade&&!immediate)||!['monthly','annual'].includes(target?.billing_cycle)||source.status!=='active'||source.provider_verified!==1||source.financial_state!=='paid'||Number(source.paid_count)<1||Date.parse(source.paid_through_at)<=Date.now()||!source.paid_through_at||Number(source.cancel_at_period_end)===1)deny('Your current subscription must have a verified paid period and active renewal before switching.','switch_source_unverified');
 if(downgrade&&input.paymentMethod!=='upi')deny('Approve UPI AutoPay to schedule a downgrade.','switch_upi_required');
 if(downgrade&&(input.singleMandate||input.promoCode||input.priceChangeId||input.reactivateFromSubscriptionId))deny('Downgrades require a fresh mandate at the published recurring price.','switch_terms_conflict');
 const live=await provider(`subscriptions/${source.provider_subscription_id}`);
 if(live.id!==source.provider_subscription_id||live.plan_id!==source.provider_plan_id||live.notes?.ca_progress_user_id!==user||live.status!=='active'||Number(live.paid_count)!==Number(source.paid_count))deny('Your existing renewal needs reconciliation before switching.','switch_source_mismatch');
 const other=await db.prepare(`SELECT s.provider_subscription_id FROM razorpay_subscriptions s WHERE s.user_id=?1 AND s.status NOT IN ('cancelled','completed','expired') AND s.provider_subscription_id<>?2 AND NOT EXISTS(SELECT 1 FROM payment_checkout_attempts a JOIN payment_checkout_retry_members m ON m.attempt_id=a.id WHERE a.provider_subscription_id=s.provider_subscription_id AND a.retry_superseded=1 AND m.group_id=(SELECT m2.group_id FROM payment_checkout_retry_members m2 JOIN payment_checkout_attempts a2 ON a2.id=m2.attempt_id WHERE a2.request_key=?3)) AND NOT EXISTS(SELECT 1 FROM subscription_checkout_switches x WHERE x.request_key=?3 AND x.user_id=?1 AND x.target_subscription_id=s.provider_subscription_id) LIMIT 1`).bind(user,source.provider_subscription_id,input.requestId).first();
 if(other)deny('Another payment setup must finish or close before switching.','switch_other_mandate');
 const legacy=await db.prepare("SELECT purchase_group_id FROM subscription_upgrades WHERE user_id=?1 AND state NOT IN ('completed','failed') LIMIT 1").bind(user).first();
 if(legacy)deny('Your previous upgrade payment must finish or close before switching.','switch_legacy_payment_pending');
 const old=await db.prepare("SELECT * FROM subscription_checkout_switches WHERE user_id=?1 AND state IN ('pending','closing_source')").bind(user).first();
 if(old&&input.retryOfAttemptId&&old.request_key!==input.requestId){
  const original=await db.prepare('SELECT request_key FROM payment_checkout_attempts WHERE id=?1 AND user_id=?2').bind(input.retryOfAttemptId,user).first();
  if(original?.request_key===old.request_key&&!old.approved_at&&old.state==='pending'){await db.prepare("UPDATE subscription_checkout_switches SET state='cancelled',updated_at=?1 WHERE request_key=?2 AND state='pending' AND approved_at IS NULL AND (lease_token IS NULL OR lease_until<?1)").bind(now(),old.request_key).run();}
 }
 const pending=await db.prepare("SELECT * FROM subscription_checkout_switches WHERE user_id=?1 AND state IN ('pending','closing_source')").bind(user).first();
 if(pending&&(pending.request_key!==input.requestId||pending.source_subscription_id!==source.provider_subscription_id||pending.target_plan_id!==input.planId))deny('Your previous switch is still being verified.','switch_in_progress');
 // A paid source checkout no longer owns the unpaid-checkout lock.
 await db.prepare(`UPDATE payment_checkout_attempts SET state='succeeded',updated_at=?1 WHERE user_id=?2 AND provider_subscription_id=?3 AND state IN ('ready','pending') AND (lease_token IS NULL OR lease_until<?1) AND EXISTS(SELECT 1 FROM payment_subscription_cycles c WHERE c.provider_subscription_id=?3 AND c.status='verified')`).bind(now(),user,source.provider_subscription_id).run();
 await db.prepare(`INSERT OR IGNORE INTO subscription_checkout_switches(request_key,user_id,source_subscription_id,source_provider_plan_id,target_plan_id,created_at,updated_at,switch_kind,effective_at,source_paid_count,source_paid_start) VALUES(?1,?2,?3,?4,?5,?6,?6,?7,?8,?9,?10)`).bind(input.requestId,user,source.provider_subscription_id,source.provider_plan_id,input.planId,now(),downgrade?'downgrade':'immediate',downgrade?source.paid_through_at:null,Number(source.paid_count),source.current_start??null).run();
 const reserved=await db.prepare('SELECT * FROM subscription_checkout_switches WHERE request_key=?1 AND user_id=?2').bind(input.requestId,user).first();
 if(!reserved||reserved.source_subscription_id!==source.provider_subscription_id||reserved.target_plan_id!==input.planId)deny('This switch request is unavailable.','switch_request_conflict');
}
export async function maintainSubscriptionSwitches(db,provider,user){
 const rows=await db.prepare(`SELECT x.*,a.provider_subscription_id discovered_target,a.state attempt_state FROM subscription_checkout_switches x LEFT JOIN payment_checkout_attempts a ON a.request_key=x.request_key AND a.user_id=x.user_id WHERE x.state IN ('pending','closing_source') AND (?1 IS NULL OR x.user_id=?1) ORDER BY x.created_at LIMIT 20`).bind(user??null).all();
 for(const row of rows.results??[]){
  const token=crypto.randomUUID(),time=now();
  const lock=await db.prepare("UPDATE subscription_checkout_switches SET lease_token=?1,lease_until=?2 WHERE request_key=?3 AND state IN ('pending','closing_source') AND (lease_token IS NULL OR lease_until<?4)").bind(token,new Date(Date.now()+300000).toISOString(),row.request_key,time).run();
  if(Number(lock.meta?.changes)!==1)continue;
  try{
   const id=row.target_subscription_id??row.discovered_target;
   if(id)await db.prepare('UPDATE subscription_checkout_switches SET target_subscription_id=?1 WHERE request_key=?2 AND lease_token=?3').bind(id,row.request_key,token).run();
   if(row.switch_kind==='downgrade'){await maintainScheduledSwitch(db,provider,{...row,target_subscription_id:id},token,time);continue;}
   if(['failed','cancelled'].includes(row.attempt_state)){await db.prepare("UPDATE subscription_checkout_switches SET state='cancelled',updated_at=?1 WHERE request_key=?2 AND lease_token=?3").bind(time,row.request_key,token).run();continue;}
   if(!id)continue;
   // Only invoice-backed, reconciled captured service payments permit retiring the old mandate.
   const paid=await db.prepare(`SELECT us.starts_at service_start,s.provider_plan_id,c.provider_payment_id,c.provider_invoice_id,c.amount_subunits,c.currency FROM razorpay_subscriptions s JOIN payment_subscription_cycles c ON c.razorpay_subscription_id=s.id AND c.provider_subscription_id=s.provider_subscription_id AND c.status='verified' JOIN user_subscriptions us ON us.provider_subscription_id=s.provider_subscription_id AND us.user_id=s.user_id WHERE s.provider_subscription_id=?1 AND s.user_id=?2 AND s.plan_id=?3 AND s.provider_verified=1 AND s.financial_state='paid' AND s.paid_count>0 AND us.starts_at<=?4 AND us.ends_at>?4 AND us.status='active' LIMIT 1`).bind(id,row.user_id,row.target_plan_id,time).first();
   if(!paid)continue;
   const target=await provider(`subscriptions/${id}`);
   if(target.id!==id||target.plan_id!==paid.provider_plan_id||target.notes?.ca_progress_user_id!==row.user_id||target.notes?.checkout_key!==row.request_key||!['active','authenticated'].includes(target.status)||Number(target.paid_count)<1)deny('New payment requires reconciliation.','switch_target_mismatch');
   const [payment,invoice]=await Promise.all([provider(`payments/${paid.provider_payment_id}`),provider(`invoices/${paid.provider_invoice_id}`)]);
   if(payment.id!==paid.provider_payment_id||payment.status!=='captured'||Number(payment.amount_refunded??0)!==0||payment.invoice_id!==paid.provider_invoice_id||Number(payment.amount)!==Number(paid.amount_subunits)||payment.currency!==paid.currency||invoice.id!==paid.provider_invoice_id||invoice.subscription_id!==id||invoice.payment_id!==payment.id||invoice.status!=='paid'||Number(invoice.amount_due)!==0||Number(invoice.amount_paid)!==Number(payment.amount))deny('New payment needs financial review.','switch_payment_mismatch');
   const source=await provider(`subscriptions/${row.source_subscription_id}`);
   if(source.plan_id!==row.source_provider_plan_id||source.id!==row.source_subscription_id||source.notes?.ca_progress_user_id!==row.user_id||!['active','pending','halted','paused','cancelled','completed','expired'].includes(source.status))deny('Previous renewal ownership could not be verified.','switch_source_owner');
   await db.prepare("UPDATE subscription_checkout_switches SET state='closing_source',effective_at=COALESCE(effective_at,?4),updated_at=?1 WHERE request_key=?2 AND lease_token=?3").bind(time,row.request_key,token,paid.service_start).run();
   if(!['cancelled','completed','expired'].includes(source.status))await provider(`subscriptions/${source.id}/cancel`,{method:'POST',body:JSON.stringify({cancel_at_cycle_end:0})});
   const confirmed=await provider(`subscriptions/${source.id}`);
   if(confirmed.id!==source.id||!['cancelled','completed','expired'].includes(confirmed.status))deny('Previous renewal cancellation is pending.','switch_source_closure_pending');
   await db.batch([
    db.prepare("UPDATE razorpay_subscriptions SET status=?1,cancel_at_period_end=0,provider_verified=1,provider_state_json=?2,updated_at=?3,paid_through_at=CASE WHEN julianday(paid_through_at)>julianday(?6) THEN ?6 ELSE paid_through_at END WHERE provider_subscription_id=?4 AND user_id=?5").bind(confirmed.status,JSON.stringify(confirmed),time,source.id,row.user_id,paid.service_start),
    db.prepare("UPDATE user_subscriptions SET ends_at=?1,status='expired' WHERE provider_subscription_id=?2 AND user_id=?3 AND ends_at>?1").bind(paid.service_start,source.id,row.user_id),
    db.prepare("UPDATE subscription_checkout_switches SET state='completed',last_error=NULL,updated_at=?1 WHERE request_key=?2 AND lease_token=?3").bind(time,row.request_key,token)
   ]);
  }catch(error){await db.prepare('UPDATE subscription_checkout_switches SET last_error=?1,updated_at=?2 WHERE request_key=?3 AND lease_token=?4').bind(error.code??'switch_reconciliation_pending',now(),row.request_key,token).run();}
  finally{await db.prepare('UPDATE subscription_checkout_switches SET lease_token=NULL,lease_until=NULL WHERE request_key=?1 AND lease_token=?2').bind(row.request_key,token).run();}
 }
}

// A debit already in flight at the bank can arrive after cancellation. Compensate only
// invoice-backed old charges captured after the verified replacement payment.
export async function maintainSwitchChargeRefunds(db,provider,user){
 const result=await db.prepare(`SELECT x.*,c.provider_invoice_id,c.provider_payment_id,n.provider_invoice_id target_invoice_id FROM subscription_checkout_switches x JOIN payment_subscription_cycles c ON c.provider_subscription_id=x.source_subscription_id AND c.status='verified' JOIN payment_subscription_cycles n ON n.provider_subscription_id=x.target_subscription_id AND n.cycle_number=1 AND n.status='verified' WHERE x.switch_kind='immediate' AND x.state IN ('closing_source','completed') AND (?1 IS NULL OR x.user_id=?1) AND datetime(x.updated_at)>datetime('now','-14 days') ORDER BY x.updated_at LIMIT 20`).bind(user??null).all();
 for(const row of result.results??[]){
  try{
   const [oldInvoice,newInvoice,payment]=await Promise.all([provider(`invoices/${row.provider_invoice_id}`),provider(`invoices/${row.target_invoice_id}`),provider(`payments/${row.provider_payment_id}`)]);
   if(oldInvoice.id!==row.provider_invoice_id||oldInvoice.subscription_id!==row.source_subscription_id||newInvoice.id!==row.target_invoice_id||newInvoice.subscription_id!==row.target_subscription_id||payment.id!==row.provider_payment_id||payment.invoice_id!==oldInvoice.id||oldInvoice.payment_id!==payment.id||payment.status!=='captured'||oldInvoice.status!=='paid'||newInvoice.status!=='paid'||Number(oldInvoice.amount_due)!==0||Number(oldInvoice.amount_paid)!==Number(payment.amount)||oldInvoice.currency!==payment.currency||Number(payment.amount_refunded??0)>0)continue;
   const paidAt=Number(oldInvoice.paid_at),replacementAt=Number(newInvoice.paid_at);
   if(!Number.isSafeInteger(paidAt)||!Number.isSafeInteger(replacementAt)||replacementAt<=0||paidAt<replacementAt||Number(oldInvoice.billing_end)<=Number(newInvoice.billing_start))continue;
   await db.prepare("INSERT OR IGNORE INTO subscription_switch_refunds(payment_id,purchase_group_id,amount_subunits,currency,state,request_key) VALUES(?1,?2,?3,?4,'pending',?5)").bind(payment.id,row.request_key,payment.amount,payment.currency,`switch_late_${payment.id}`).run();
  }catch{ /* Unverified charges are never refunded speculatively. Retry from durable cycles. */ }
 }
 await maintainUpgradeRefunds(db,{provider},'subscription_switch_refunds');
}

export {reverseScheduledSwitch};
