import {CheckoutError} from './checkout-engine.mjs';
import {tierRank} from './plan-policy.mjs';
import {stopProviderRenewal} from './collection-maintenance.mjs';
const now=()=>new Date().toISOString();
const fail=(message,code,status=409)=>{throw new CheckoutError(message,code,status);};
const terminal=s=>['cancelled','completed','expired'].includes(s);
async function eligible(db,g,time=now()){
 const target=await db.prepare("SELECT id,tier_key,billing_cycle,active,checkout_enabled FROM subscription_plans WHERE id=?1").bind(g.plan_id).first();
 if(!target||!['basic','pro'].includes(target.tier_key)||!['monthly','annual'].includes(target.billing_cycle)||Number(target.active)!==1||Number(target.checkout_enabled)!==1)fail('This gift plan is not available.','gift_plan_unavailable');
 const user=await db.prepare("SELECT user_id FROM app_users WHERE user_id=?1 AND account_state='active' AND role='student'").bind(g.recipient_user_id).first();if(!user)fail('This student cannot receive a gift.','gift_recipient_unavailable');
 const current=await db.prepare(`SELECT p.tier_key FROM user_subscriptions us JOIN subscription_plans p ON p.id=us.plan_id WHERE us.user_id=?1 AND us.status IN ('active','paused','cancelled') AND us.starts_at<=?2 AND us.ends_at>?2 AND NOT EXISTS(SELECT 1 FROM razorpay_subscriptions s WHERE s.provider_subscription_id=us.provider_subscription_id AND s.gift_id=?3) ORDER BY p.rank DESC,us.starts_at DESC LIMIT 1`).bind(g.recipient_user_id,time,g.id).first();
 const reward=await db.prepare(`SELECT p.tier_key FROM leaderboard_reward_grants r JOIN subscription_plans p ON p.id=r.plan_id AND p.active=1 WHERE r.user_id=?1 AND r.status IN ('scheduled','active','withheld') AND r.starts_at<=?2 AND r.ends_at>?2 AND NOT EXISTS(SELECT 1 FROM anti_cheat_flags f WHERE f.user_id=r.user_id AND f.status IN ('pending','upheld')) ORDER BY p.rank DESC LIMIT 1`).bind(g.recipient_user_id,time).first();
 if(Math.max(tierRank(current?.tier_key),tierRank(reward?.tier_key))>=tierRank(target.tier_key))fail('Gifts are available only for students on a lower plan.','gift_not_higher_plan');return target;
}
export async function offerGift(db,purchaser,{recipientUsername,planId,requestId}){
 const username=String(recipientUsername??'').trim().toLowerCase();if(!/^[a-z0-9_.-]{3,40}$/.test(username)||!/^[-_a-zA-Z0-9]{16,100}$/.test(String(requestId))||typeof planId!=='string')fail('Enter the exact student username and choose a plan.','gift_invalid_request',400);
 const recipient=await db.prepare('SELECT user_id FROM account_usernames WHERE username=?1 COLLATE NOCASE').bind(username).first();if(!recipient||recipient.user_id===purchaser)fail('Choose another eligible student.','gift_recipient_unavailable');
 const old=await db.prepare('SELECT * FROM recurring_gifts WHERE purchaser_user_id=?1 AND request_key=?2').bind(purchaser,requestId).first();if(old){if(old.recipient_user_id!==recipient.user_id||old.plan_id!==planId)fail('This gift request keeps its original recipient and plan.','gift_request_conflict');return old;}
 const g={id:crypto.randomUUID(),purchaser_user_id:purchaser,recipient_user_id:recipient.user_id,plan_id:planId};await eligible(db,g);const time=now();
 await db.prepare("INSERT INTO recurring_gifts(id,purchaser_user_id,recipient_user_id,plan_id,request_key,state,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,'offered',?6,?6)").bind(g.id,purchaser,recipient.user_id,planId,requestId,time).run();return {...g,state:'offered'};
}
export async function acceptGift(db,recipient,id){
 const g=await db.prepare('SELECT * FROM recurring_gifts WHERE id=?1 AND recipient_user_id=?2').bind(id,recipient).first();if(!g)fail('Gift not found.','gift_not_found',404);if(['accepted','active'].includes(g.state))return g;if(g.state!=='offered')fail('This gift is no longer awaiting acceptance.','gift_not_offered');await eligible(db,g);
 const open=await db.prepare("SELECT id FROM recurring_gifts WHERE recipient_user_id=?1 AND state='accepted' AND id<>?2").bind(recipient,id).first();if(open)fail('Finish or cancel your accepted gift before accepting another.','gift_already_active');
 const time=now();const result=await db.prepare("UPDATE recurring_gifts SET state='accepted',accepted_at=?1,updated_at=?1 WHERE id=?2 AND recipient_user_id=?3 AND state='offered'").bind(time,id,recipient).run();if(Number(result.meta?.changes)!==1)fail('Refresh your gifts before accepting.','gift_acceptance_changed');return {...g,state:'accepted',accepted_at:time};
}
export async function giftCheckout(db,payer,input){
 const g=await db.prepare('SELECT * FROM recurring_gifts WHERE id=?1 AND purchaser_user_id=?2').bind(input.giftId,payer).first();if(!g||g.plan_id!==input.planId||!g.accepted_at||!['accepted','active'].includes(g.state))fail('The recipient must accept this gift before you approve AutoPay.','gift_checkout_unavailable');
 if(input.switchFromSubscriptionId||input.singleMandate||input.reactivateFromSubscriptionId||input.promoCode)fail('Gift memberships use a fresh AutoPay mandate at the normal price.','gift_terms_conflict');
 if(g.state==='active'&&!input.priceChangeId){const attempt=await db.prepare("SELECT id FROM payment_checkout_attempts WHERE id=?1 AND user_id=?2 AND json_extract(input_json,'$.giftId')=?3").bind(input.retryOfAttemptId??null,payer,g.id).first();if(!attempt)fail('This gift is already active. Manage its renewal instead.','gift_already_active');}
 if(g.state==='accepted')await eligible(db,g);return g;
}
export async function giftAccessDecision(db,local){
 if(!local.gift_id)return {userId:local.user_id,allowed:true};
 const g=await db.prepare('SELECT * FROM recurring_gifts WHERE id=?1 AND purchaser_user_id=?2 AND plan_id=?3').bind(local.gift_id,local.user_id,local.plan_id).first();
 if(!g||!g.accepted_at||!['accepted','active','cancelled','expired'].includes(g.state))return {userId:g?.recipient_user_id??local.user_id,allowed:false};
 if(g.state==='accepted'){try{await eligible(db,g);}catch(error){if(error.code==='gift_not_higher_plan'||error.code==='gift_recipient_unavailable'||error.code==='gift_plan_unavailable'){await db.prepare("UPDATE recurring_gifts SET state='rejected',last_error=?1,updated_at=?2 WHERE id=?3 AND state='accepted'").bind(error.code,now(),g.id).run();await db.prepare('INSERT OR IGNORE INTO recurring_gift_stop_intents(source_subscription_id,gift_id,boundary_at,paid_count_before,paid_start_before,requested_at) VALUES(?1,?2,NULL,0,NULL,?3)').bind(local.id,g.id,now()).run();await enforceGiftStops(db,local,{});return {userId:g.recipient_user_id,allowed:false};}throw error;}}
 return {userId:g.recipient_user_id,allowed:true,gift:g};
}
export async function enforceGiftStops(db,local,evidence){
 const stop=await db.prepare('SELECT * FROM recurring_gift_stop_intents WHERE source_subscription_id=?1').bind(local.id).first();if(!stop)return evidence;
 const cycles=await db.prepare("SELECT * FROM payment_subscription_cycles WHERE razorpay_subscription_id=?1 AND status='verified' AND cycle_number>?2").bind(local.id,stop.paid_count_before).all();
 for(const c of cycles.results??[])await db.prepare("INSERT OR IGNORE INTO subscription_cancellation_refunds(payment_id,purchase_group_id,amount_subunits,currency,state,request_key) VALUES(?1,?2,?3,?4,'pending',?5)").bind(c.provider_payment_id,local.id,c.amount_subunits,c.currency,'cancelled_renewal_'+c.provider_payment_id).run();
 return {...evidence,paidCount:Number(stop.paid_count_before),paidThrough:Number(stop.paid_count_before)>0?stop.boundary_at:null,latestPaidStart:stop.paid_start_before,forcePaidBoundary:true,firstCycleVerified:Number(stop.paid_count_before)>0};
}
export async function cancelGift(db,provider,actor,id){
 const g=await db.prepare('SELECT * FROM recurring_gifts WHERE id=?1 AND (purchaser_user_id=?2 OR recipient_user_id=?2)').bind(id,actor).first();if(!g)fail('Gift not found.','gift_not_found',404);
 const time=now();await db.prepare("UPDATE recurring_gifts SET state=?1,cancel_requested_at=COALESCE(cancel_requested_at,?2),cancelled_by=COALESCE(cancelled_by,?3),updated_at=?2 WHERE id=?4").bind(g.state==='offered'&&actor===g.recipient_user_id?'rejected':'cancelled',time,actor,id).run();
 await db.prepare("UPDATE subscription_policy_change_jobs SET state='superseded' WHERE source_subscription_id IN(SELECT id FROM razorpay_subscriptions WHERE gift_id=?1) AND state IN ('pending','awaiting_approval')").bind(id).run();
 await stopGiftSubscriptions(db,provider,{...g,cancel_requested_at:g.cancel_requested_at??time});return {ok:true,beneficiaryUserId:g.recipient_user_id};
}
async function stopGiftSubscriptions(db,provider,g){
 const rows=await db.prepare('SELECT * FROM razorpay_subscriptions WHERE gift_id=?1').bind(g.id).all();
 for(const s of rows.results??[]){
  const count=g.activated_at?Number(s.paid_count):0,boundary=count>0?s.paid_through_at:null;
  await db.prepare('INSERT OR IGNORE INTO recurring_gift_stop_intents(source_subscription_id,gift_id,boundary_at,paid_count_before,paid_start_before,requested_at) VALUES(?1,?2,?3,?4,?5,?6)').bind(s.id,g.id,boundary,count,s.current_start??null,g.cancel_requested_at??now()).run();
  await db.prepare('UPDATE razorpay_subscriptions SET cancel_at_period_end=?1 WHERE id=?2').bind(boundary&&Date.parse(boundary)>Date.now()?1:0,s.id).run();
  const intent=await db.prepare('SELECT * FROM recurring_gift_stop_intents WHERE source_subscription_id=?1').bind(s.id).first();
  await db.prepare("UPDATE user_subscriptions SET ends_at=CASE WHEN ends_at>?1 THEN ?1 ELSE ends_at END,status=CASE WHEN ?1>?2 THEN 'cancelled' ELSE 'expired' END,updated_at=?2 WHERE provider_subscription_id=?3 AND user_id=?4").bind(intent.boundary_at??g.cancel_requested_at??now(),now(),s.provider_subscription_id,g.recipient_user_id).run();
  if(intent.confirmed_at)continue;
  try{
   const sub=await stopProviderRenewal(provider,s,Boolean(intent.boundary_at&&Date.parse(intent.boundary_at)>Date.now()));
   await db.batch([db.prepare('UPDATE recurring_gift_stop_intents SET confirmed_at=?1,last_error=NULL WHERE source_subscription_id=?2').bind(now(),s.id),db.prepare('UPDATE razorpay_subscriptions SET status=?1,provider_state_json=?2,updated_at=?3 WHERE id=?4').bind(sub.status,JSON.stringify(sub),now(),s.id)]);
  }catch(error){await db.prepare('UPDATE recurring_gift_stop_intents SET last_error=?1 WHERE source_subscription_id=?2').bind(error.message,s.id).run();}
 }
}
export async function maintainGifts(db,provider){
 const rows=await db.prepare("SELECT * FROM recurring_gifts WHERE state IN ('cancelled','rejected') AND EXISTS(SELECT 1 FROM razorpay_subscriptions s LEFT JOIN recurring_gift_stop_intents i ON i.source_subscription_id=s.id WHERE s.gift_id=recurring_gifts.id AND i.confirmed_at IS NULL) ORDER BY updated_at LIMIT 30").all();for(const g of rows.results??[])await stopGiftSubscriptions(db,provider,g);
 const active=await db.prepare("SELECT g.*,s.status,s.cancel_at_period_end,s.paid_through_at,s.grace_until FROM recurring_gifts g JOIN razorpay_subscriptions s ON s.provider_subscription_id=g.provider_subscription_id WHERE g.state='active' ORDER BY g.updated_at LIMIT 30").all();
 for(const g of active.results??[]){await db.prepare("UPDATE recurring_gifts SET updated_at=?1 WHERE id=?2").bind(now(),g.id).run();if((terminal(g.status)||['pending','halted'].includes(g.status))&&Date.parse(g.grace_until??g.paid_through_at)<=Date.now())await db.prepare("UPDATE recurring_gifts SET state='expired',updated_at=?1 WHERE id=?2 AND state='active'").bind(now(),g.id).run();}
}
