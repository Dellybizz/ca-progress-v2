import {giftAccessDecision} from '../../lib/billing/gifts.mjs';
import {retryProjectionStatements} from '../../lib/billing/checkout-retries.mjs';
import type {Database,Statement} from '../../lib/billing/checkout-engine.mjs';
type Row=Record<string,unknown>;
export async function withSubscriptionLease<T>(db:Database,id:string,run:(token:string)=>Promise<T>):Promise<T>{
 const token=crypto.randomUUID(),now=new Date().toISOString(),until=new Date(Date.now()+300000).toISOString();
 const claim=await db.prepare(`INSERT INTO billing_subscription_leases(provider_subscription_id,token,lease_until) VALUES(?1,?2,?3)
 ON CONFLICT(provider_subscription_id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE lease_until<=?4`).bind(id,token,until,now).run();
 if(Number(claim.meta?.changes??0)!==1)throw new Error('Subscription reconciliation is already processing.');
 try{return await run(token);}finally{await db.prepare('DELETE FROM billing_subscription_leases WHERE provider_subscription_id=?1 AND token=?2').bind(id,token).run();}
}
export async function commitAccessProjection(db:Database,input:{local:Row;token:string;metadata:Statement;planId:string;policyId:string;status:string;starts:string|null;ends:string|null;paymentId:string|null;eventType:string;providerStatus:string}){
 const {local,token,metadata,planId,policyId,status,paymentId,eventType}=input,stamp=new Date().toISOString();
 const starts=input.starts;let ends=input.ends;const gift=local.gift_id?await giftAccessDecision(db,local):null;const userId=gift?.userId??local.user_id;if(gift&&!gift.allowed)ends=null;
 if(ends&&local.gift_id){const stop=await db.prepare('SELECT boundary_at,paid_count_before FROM recurring_gift_stop_intents WHERE source_subscription_id=?1').bind(local.id).first<Row>();if(stop){ends=Number(stop.paid_count_before)>0&&stop.boundary_at?String(stop.boundary_at):null;}}
 if(ends){const retired=await db.prepare('SELECT boundary_at FROM recurring_gift_source_retirements WHERE source_subscription_id=?1 ORDER BY boundary_at LIMIT 1').bind(local.id).first<Row>();if(retired&&Date.parse(String(retired.boundary_at))<Date.parse(ends))ends=String(retired.boundary_at);}
 const existing=await db.prepare('SELECT * FROM user_subscriptions WHERE provider_subscription_id=?1 LIMIT 1').bind(local.provider_subscription_id).first<Row>();
 const writes=[db.prepare('INSERT INTO billing_projection_guards(token,subscription_id,expected_version) VALUES(?1,?2,?3)').bind(token,local.id,Number(local.projection_version??0)),metadata];
 writes.push(...retryProjectionStatements(db,local.provider_subscription_id));
 const valid=Boolean(ends&&Date.parse(ends)>Date.now());
 if(valid&&local.gift_id)writes.push(db.prepare('INSERT INTO billing_gift_projection_guards(token,gift_id,recipient_user_id,source_subscription_id,ends_at) VALUES(?1,?2,?3,?4,?5)').bind(token,local.gift_id,userId,local.id,ends));
 if(valid){
  const id=existing?String(existing.id):crypto.randomUUID(),begin=starts||String(existing?.starts_at||stamp);
  if(existing)writes.push(db.prepare('UPDATE user_subscriptions SET plan_id=?1,status=?2,starts_at=?3,ends_at=?4,source_payment_id=COALESCE(?5,source_payment_id),updated_at=?6 WHERE id=?7').bind(planId,status,begin,ends,paymentId,stamp,id));
  else writes.push(db.prepare("INSERT INTO user_subscriptions(id,user_id,plan_id,status,starts_at,ends_at,source,source_order_id,source_payment_id,provider_subscription_id,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,'razorpay',?7,?8,?7,?9,?9)").bind(id,userId,planId,status,begin,ends,local.provider_subscription_id,paymentId,stamp));
  writes.push(db.prepare(`INSERT INTO subscription_policy_contracts(subscription_id,policy_version_id,grandfathered,decision_reason) SELECT ?1,?2,1,'Verified recurring invoice projection' WHERE EXISTS(SELECT 1 FROM user_subscriptions WHERE id=?1 AND status<>'expired') ON CONFLICT(subscription_id) DO UPDATE SET policy_version_id=excluded.policy_version_id,decision_reason=excluded.decision_reason`).bind(id,policyId));
  if(!existing||existing.plan_id!==planId||existing.status!==status||existing.starts_at!==begin||existing.ends_at!==ends)writes.push(db.prepare("INSERT INTO subscription_events(id,subscription_id,user_id,plan_id,payment_event_id,event_type,source,starts_at,ends_at,metadata,created_at) SELECT ?1,?2,?3,?4,NULL,?5,'razorpay_subscription',?6,?7,?8,?9 WHERE EXISTS(SELECT 1 FROM user_subscriptions WHERE id=?2 AND status<>'expired')").bind(crypto.randomUUID(),id,userId,planId,existing?(existing.status!==status?(status==='paused'?'paused':status==='cancelled'?'cancelled':'resumed'):'extended'):'granted',begin,ends,JSON.stringify({provider_subscription_id:local.provider_subscription_id,provider_event:eventType}),stamp));
  if(valid&&local.gift_id)writes.push(db.prepare("UPDATE recurring_gifts SET activated_at=COALESCE(activated_at,?1),state=CASE WHEN state IN ('accepted','expired') THEN 'active' ELSE state END,provider_subscription_id=?2,updated_at=?1 WHERE id=?3 AND NOT EXISTS(SELECT 1 FROM payment_checkout_attempts a JOIN payment_checkout_retry_members m ON m.attempt_id=a.id JOIN payment_checkout_retry_groups g ON g.id=m.group_id WHERE a.provider_subscription_id=?2 AND g.winner_attempt_id IS NOT NULL AND g.winner_attempt_id<>a.id)").bind(stamp,local.provider_subscription_id,local.gift_id),db.prepare('DELETE FROM billing_gift_projection_guards WHERE token=?1').bind(token));
 writes.push(db.prepare('UPDATE razorpay_subscriptions SET linked_access_subscription_id=?1 WHERE id=?2 AND EXISTS(SELECT 1 FROM user_subscriptions WHERE id=?1)').bind(id,local.id));
  }else if(existing&&gift&&!gift.allowed){writes.push(db.prepare("UPDATE user_subscriptions SET status='expired',updated_at=?1 WHERE id=?2").bind(stamp,existing.id));
 }else if(existing&&ends&&Date.parse(ends)<=Date.now()){
  if(existing.status!=='expired')writes.push(db.prepare("INSERT INTO subscription_events(id,subscription_id,user_id,plan_id,event_type,source,starts_at,ends_at,metadata,created_at) VALUES(?1,?2,?3,?4,'expired','razorpay_subscription',?5,?6,?7,?8)").bind(crypto.randomUUID(),existing.id,userId,existing.plan_id,existing.starts_at,ends,JSON.stringify({provider_subscription_id:local.provider_subscription_id,provider_event:eventType,reason:'verified_access_boundary'}),stamp));
  writes.push(db.prepare("UPDATE user_subscriptions SET status='expired',updated_at=?1 WHERE id=?2 AND status<>'expired'").bind(stamp,existing.id));
 }

 writes.push(db.prepare('UPDATE razorpay_subscriptions SET projection_version=projection_version+1 WHERE id=?1').bind(local.id),db.prepare('DELETE FROM billing_projection_guards WHERE token=?1').bind(token));
 const result=await db.batch(writes);if(result.some(r=>r.success===false))throw new Error('Access projection could not be committed.');
}
