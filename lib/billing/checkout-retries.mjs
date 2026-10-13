import {CheckoutError} from './checkout-engine.mjs';
import {maintainUpgradeRefunds} from './upgrade-refunds.mjs';
const time=()=>new Date().toISOString();
export async function reserveRetry(db,user,input){
 const existing=await db.prepare('SELECT * FROM payment_checkout_attempts WHERE request_key=?1 AND user_id=?2').bind(input.requestId,user).first();
 if(existing)return existing;
 const original=await db.prepare('SELECT * FROM payment_checkout_attempts WHERE id=?1 AND user_id=?2').bind(input.retryOfAttemptId,user).first();
 if(!original)throw new CheckoutError('Original payment attempt was not found.','retry_owner_mismatch',404);
 const oldInput=JSON.parse(original.input_json);
 if(Number(JSON.parse(original.contract_json).trialDays)>0)throw new CheckoutError('Resume your original trial authorization.','retry_trial_unsupported');
 if((oldInput.switchFromSubscriptionId??null)!==(input.switchFromSubscriptionId??null))throw new CheckoutError('Retry must keep the existing switch source.','retry_switch_source_changed');
 // Owner scenario 1: a retry may change method; its own preparation validates the mandate.
 if(original.lease_token&&Date.parse(original.lease_until)>Date.now())throw new CheckoutError('Payment preparation is still running. Try again shortly.','retry_preparation_busy');
 if(!['dispatching','uncertain','provider_created','ready','pending','failed','cancelled'].includes(original.state))throw new CheckoutError('Check the original payment before retrying.','retry_attempt_terminal');
 const settled=original.provider_subscription_id?await db.prepare('SELECT paid_count,financial_state,paid_through_at FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(original.provider_subscription_id,user).first():null;
 if(settled&&Number(settled.paid_count)>0&&(settled.financial_state!=='paid'||Date.parse(settled.paid_through_at)<=Date.now()))throw new CheckoutError('This is a previous settled subscription, not an unconfirmed checkout.','retry_previous_paid_period');
 // An established paid plan is an upgrade, not a duplicate checkout retry.
 const unrelated=await db.prepare(`SELECT s.id FROM razorpay_subscriptions s WHERE s.user_id=?1 AND s.financial_state='paid' AND s.paid_count>0 AND julianday(s.paid_through_at)>julianday('now') AND s.provider_subscription_id IS NOT ?2 AND s.provider_subscription_id IS NOT ?4 AND NOT EXISTS(SELECT 1 FROM payment_checkout_attempts a JOIN payment_checkout_retry_members m ON m.attempt_id=a.id WHERE a.provider_subscription_id=s.provider_subscription_id AND m.group_id=(SELECT group_id FROM payment_checkout_retry_members WHERE attempt_id=?3)) LIMIT 1`).bind(user,original.provider_subscription_id,original.id,input.switchFromSubscriptionId??null).first();
 if(unrelated)throw new CheckoutError('Your paid subscription is active. Use Change plan.','retry_established_subscription');
 const member=await db.prepare('SELECT group_id FROM payment_checkout_retry_members WHERE attempt_id=?1').bind(original.id).first(),group=member?.group_id??crypto.randomUUID(),id=crypto.randomUUID(),now=time();
 const fp=JSON.stringify([input.planId,input.paymentMethod,input.policyVersionId,input.promoCode,...(input.switchFromSubscriptionId?[input.switchFromSubscriptionId]:[]),...(input.singleMandate?[true]:[]),...(input.acceptRegularPriceFallback?[true]:[])]);
 await db.batch([
  db.prepare("UPDATE subscription_checkout_switches SET state='cancelled',updated_at=?2 WHERE request_key=?1 AND user_id=?3 AND state='pending'").bind(original.request_key,now,user),
  db.prepare('INSERT OR IGNORE INTO payment_checkout_retry_groups(id,user_id,created_at,updated_at) VALUES(?1,?2,?3,?3)').bind(group,user,now),
  db.prepare('INSERT OR IGNORE INTO payment_checkout_retry_members(attempt_id,group_id,choice_sequence) VALUES(?1,?2,1)').bind(original.id,group),
  db.prepare("UPDATE payment_checkout_attempts SET retry_superseded=1 WHERE user_id=?1 AND id IN (SELECT attempt_id FROM payment_checkout_retry_members WHERE group_id=?2)").bind(user,group),
  db.prepare("INSERT INTO payment_checkout_attempts(id,request_key,user_id,fingerprint,input_json,state,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,'reserved',?6,?6)").bind(id,input.requestId,user,fp,JSON.stringify(input),now),
  db.prepare('INSERT INTO payment_checkout_retry_members(attempt_id,group_id,choice_sequence) SELECT ?1,?2,MAX(choice_sequence)+1 FROM payment_checkout_retry_members WHERE group_id=?2').bind(id,group),
 ]);
 return db.prepare('SELECT * FROM payment_checkout_attempts WHERE id=?1 AND user_id=?2').bind(id,user).first();
}
export function retryProjectionStatements(db,subscriptionId){
 const group=`(SELECT m.group_id FROM payment_checkout_retry_members m JOIN payment_checkout_attempts a ON a.id=m.attempt_id WHERE a.provider_subscription_id=?1)`;
 return [
  db.prepare(`UPDATE payment_checkout_retry_groups SET winner_attempt_id=COALESCE((SELECT m.attempt_id FROM payment_checkout_retry_members m JOIN payment_checkout_attempts a ON a.id=m.attempt_id WHERE m.group_id=payment_checkout_retry_groups.id AND EXISTS(SELECT 1 FROM razorpay_subscriptions s WHERE s.provider_subscription_id=a.provider_subscription_id AND s.financial_state='paid' AND s.provider_verified=1 AND s.paid_count>0) AND EXISTS(SELECT 1 FROM payment_subscription_cycles c WHERE c.provider_subscription_id=a.provider_subscription_id AND c.status='verified') AND NOT EXISTS(SELECT 1 FROM subscription_retry_refunds r JOIN payment_subscription_cycles c ON c.provider_payment_id=r.payment_id WHERE c.provider_subscription_id=a.provider_subscription_id) ORDER BY m.choice_sequence DESC LIMIT 1),winner_attempt_id),updated_at=?2 WHERE id=${group}`).bind(subscriptionId,time()),
  db.prepare(`UPDATE user_subscriptions SET status='expired',updated_at=?2 WHERE provider_subscription_id IN (SELECT a.provider_subscription_id FROM payment_checkout_attempts a JOIN payment_checkout_retry_members m ON m.attempt_id=a.id JOIN payment_checkout_retry_groups g ON g.id=m.group_id WHERE g.id=${group} AND g.winner_attempt_id IS NOT NULL AND a.id<>g.winner_attempt_id)`).bind(subscriptionId,time()),
  db.prepare(`INSERT OR IGNORE INTO subscription_retry_refunds(payment_id,purchase_group_id,amount_subunits,currency,state,request_key) SELECT c.provider_payment_id,g.id,c.amount_subunits,c.currency,'pending','retry_duplicate_'||c.provider_payment_id FROM payment_checkout_retry_groups g JOIN payment_checkout_retry_members m ON m.group_id=g.id JOIN payment_checkout_attempts a ON a.id=m.attempt_id JOIN payment_subscription_cycles c ON c.provider_subscription_id=a.provider_subscription_id AND c.status='verified' WHERE g.id=${group} AND g.winner_attempt_id IS NOT NULL AND a.id<>g.winner_attempt_id`).bind(subscriptionId),
  db.prepare(`INSERT OR IGNORE INTO checkout_retry_closures(provider_subscription_id,group_id,user_id,updated_at) SELECT a.provider_subscription_id,g.id,g.user_id,?2 FROM payment_checkout_retry_groups g JOIN payment_checkout_retry_members m ON m.group_id=g.id JOIN payment_checkout_attempts a ON a.id=m.attempt_id WHERE g.id=${group} AND g.winner_attempt_id IS NOT NULL AND a.id<>g.winner_attempt_id AND a.provider_subscription_id IS NOT NULL AND (m.choice_sequence<(SELECT choice_sequence FROM payment_checkout_retry_members WHERE attempt_id=g.winner_attempt_id) OR EXISTS(SELECT 1 FROM payment_subscription_cycles c WHERE c.provider_subscription_id=a.provider_subscription_id AND c.status='verified'))`).bind(subscriptionId,time()),
 ];
}
export async function maintainCheckoutRetries(db,provider,user){
 const groups=await db.prepare(`SELECT a.provider_subscription_id FROM payment_checkout_retry_members m JOIN payment_checkout_attempts a ON a.id=m.attempt_id WHERE a.provider_subscription_id IS NOT NULL AND (?1 IS NULL OR a.user_id=?1) ORDER BY a.updated_at LIMIT 40`).bind(user??null).all();
 for(const row of groups.results??[])await db.batch([...retryProjectionStatements(db,row.provider_subscription_id),db.prepare('UPDATE payment_checkout_attempts SET updated_at=?2 WHERE provider_subscription_id=?1').bind(row.provider_subscription_id,time())]);
 const closures=await db.prepare("SELECT * FROM checkout_retry_closures WHERE state='pending' AND (?1 IS NULL OR user_id=?1) ORDER BY updated_at LIMIT 20").bind(user??null).all();
 for(const row of closures.results??[]){try{
  const sub=await provider(`subscriptions/${row.provider_subscription_id}`);
  const attempt=await db.prepare('SELECT request_key FROM payment_checkout_attempts WHERE provider_subscription_id=?1 AND user_id=?2').bind(row.provider_subscription_id,row.user_id).first();
  if(sub.id!==row.provider_subscription_id||sub.notes?.ca_progress_user_id!==row.user_id||sub.notes?.checkout_key!==attempt?.request_key)throw new Error('retry_closure_owner_mismatch');
  if(!['cancelled','completed','expired'].includes(sub.status))await provider(`subscriptions/${sub.id}/cancel`,{method:'POST',body:JSON.stringify({cancel_at_cycle_end:0})});
  const confirmed=await provider(`subscriptions/${sub.id}`);
  if(confirmed.id!==sub.id||!['cancelled','completed','expired'].includes(confirmed.status))throw new Error('retry_closure_pending');
  await db.batch([db.prepare("UPDATE checkout_retry_closures SET state='closed',last_error=NULL,updated_at=?2 WHERE provider_subscription_id=?1").bind(sub.id,time()),db.prepare('UPDATE razorpay_subscriptions SET status=?2,updated_at=?3 WHERE provider_subscription_id=?1 AND user_id=?4').bind(sub.id,confirmed.status,time(),row.user_id)]);
 }catch(error){await db.prepare('UPDATE checkout_retry_closures SET last_error=?2,updated_at=?3 WHERE provider_subscription_id=?1').bind(row.provider_subscription_id,error.message,time()).run();}}
 await maintainUpgradeRefunds(db,{provider},'subscription_retry_refunds');
}
