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
 const {local,token,metadata,planId,policyId,status,starts,ends,paymentId,eventType,providerStatus}=input,stamp=new Date().toISOString();
 const existing=await db.prepare('SELECT * FROM user_subscriptions WHERE provider_subscription_id=?1 LIMIT 1').bind(local.provider_subscription_id).first<Row>();
 const writes=[db.prepare('INSERT INTO billing_projection_guards(token,subscription_id,expected_version) VALUES(?1,?2,?3)').bind(token,local.id,Number(local.projection_version??0)),metadata];
 const valid=Boolean(ends&&Date.parse(ends)>Date.now());
 if(valid){
  const id=existing?String(existing.id):crypto.randomUUID(),begin=starts||String(existing?.starts_at||stamp);
  if(existing)writes.push(db.prepare('UPDATE user_subscriptions SET plan_id=?1,status=?2,starts_at=?3,ends_at=?4,source_payment_id=COALESCE(?5,source_payment_id),updated_at=?6 WHERE id=?7').bind(planId,status,begin,ends,paymentId,stamp,id));
  else writes.push(db.prepare("INSERT INTO user_subscriptions(id,user_id,plan_id,status,starts_at,ends_at,source,source_order_id,source_payment_id,provider_subscription_id,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,'razorpay',?7,?8,?7,?9,?9)").bind(id,local.user_id,planId,status,begin,ends,local.provider_subscription_id,paymentId,stamp));
  writes.push(db.prepare(`INSERT INTO subscription_policy_contracts(subscription_id,policy_version_id,grandfathered,decision_reason) VALUES(?1,?2,1,'Verified recurring invoice projection') ON CONFLICT(subscription_id) DO UPDATE SET policy_version_id=excluded.policy_version_id,decision_reason=excluded.decision_reason`).bind(id,policyId));
  if(!existing||existing.plan_id!==planId||existing.status!==status||existing.starts_at!==begin||existing.ends_at!==ends)writes.push(db.prepare("INSERT INTO subscription_events(id,subscription_id,user_id,plan_id,payment_event_id,event_type,source,starts_at,ends_at,metadata,created_at) VALUES(?1,?2,?3,?4,NULL,?5,'razorpay_subscription',?6,?7,?8,?9)").bind(crypto.randomUUID(),id,local.user_id,planId,existing?(existing.status!==status?(status==='paused'?'paused':status==='cancelled'?'cancelled':'resumed'):'extended'):'granted',begin,ends,JSON.stringify({provider_subscription_id:local.provider_subscription_id,provider_event:eventType}),stamp));
  writes.push(db.prepare('UPDATE razorpay_subscriptions SET linked_access_subscription_id=?1 WHERE id=?2').bind(id,local.id));
 }else if(existing&&['cancelled','completed','expired'].includes(providerStatus))writes.push(db.prepare("UPDATE user_subscriptions SET status='expired',updated_at=?1 WHERE id=?2").bind(stamp,existing.id));
 writes.push(db.prepare('UPDATE razorpay_subscriptions SET projection_version=projection_version+1 WHERE id=?1').bind(local.id),db.prepare('DELETE FROM billing_projection_guards WHERE token=?1').bind(token));
 const result=await db.batch(writes);if(result.some(r=>r.success===false))throw new Error('Access projection could not be committed.');
}
