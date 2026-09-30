import previous from './payment-p3';
import {dependencies} from './payment-p2';
import {recoverCheckout} from '../../lib/billing/checkout-engine.mjs';
import {reconcile} from './p3';
import {campaignReconcile} from './p4-final';
import {readWebhookBytes} from '../../lib/billing/webhook-body.mjs';
type Row=Record<string,unknown>;
type Env=Parameters<typeof previous.fetch>[1]&{RAZORPAY_WEBHOOK_SECRET_PREVIOUS?:string;BILLING_WEBHOOK_MAX_PER_MINUTE?:string};
type Job={kind:'inbox';eventKey:string}|{kind:'webhook';raw:string;signature:string;eventId:string|null}|{kind:'reconcile';subscriptionId:string;userId:string;reason:string;runId:string|null};
type Message={body:Job;ack():void;retry():void};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store'}});
const stamp=()=>new Date().toISOString();
async function digest(bytes:ArrayBuffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function sign(secret:string,bytes:ArrayBuffer){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function equal(a:string,b:string){let difference=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return difference===0;}
async function provider(env:Env,path:string){if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)throw new Error('provider_unavailable');const r=await fetch(`https://api.razorpay.com/v1/${path}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:`Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`}});if(!r.ok)throw new Error('provider_read_pending');return await r.json() as Row;}
async function ingest(request:Request,env:Env){
 if(!env.DB||!env.RAZORPAY_WEBHOOK_SECRET)return json({error:'Webhook ingestion is unavailable.'},503);
 let bytes:ArrayBuffer;try{bytes=await readWebhookBytes(request);}catch{return json({error:'Webhook payload is too large or unreadable.'},413);}
 const signature=request.headers.get('x-razorpay-signature')?.trim().toLowerCase()??'';if(!/^[a-f0-9]{64}$/.test(signature))return json({error:'Webhook signature is invalid.'},400);
 let version='current',valid=equal(signature,await sign(env.RAZORPAY_WEBHOOK_SECRET,bytes));
 if(!valid&&env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS){valid=equal(signature,await sign(env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS,bytes));version='previous';}
 if(!valid)return json({error:'Webhook signature verification failed.'},400);
 let raw:string,payload:Row;try{raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);payload=JSON.parse(raw);if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.event!=='string'||payload.event.length>100)throw new Error();}catch{return json({error:'Invalid webhook JSON.'},400);}
 const hash=await digest(bytes),eventKey=request.headers.get('x-razorpay-event-id')||`body:${hash}`;if(eventKey.length>200)return json({error:'Invalid event identity.'},400);
 const configured=Number(env.BILLING_WEBHOOK_MAX_PER_MINUTE??500),limit=Number.isSafeInteger(configured)&&configured>0?configured:500;
 const rate=await env.DB.prepare('INSERT INTO billing_webhook_rate_windows(window_start,accepted_count) VALUES(?1,1) ON CONFLICT(window_start) DO UPDATE SET accepted_count=accepted_count+1 WHERE accepted_count<?2').bind(Math.floor(Date.now()/60000),limit).run();
 if(Number(rate.meta?.changes??0)!==1)return json({error:'Webhook ingress is temporarily rate limited. Retry delivery.'},429);
 const time=stamp();await env.DB.prepare("INSERT OR IGNORE INTO billing_webhook_inbox(event_key,payload_sha256,raw_body,signature,secret_version,event_type,available_at,received_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?7,?7)").bind(eventKey,hash,raw,signature,version,payload.event,time).run();
 const row=await env.DB.prepare('SELECT payload_sha256,state FROM billing_webhook_inbox WHERE event_key=?1').bind(eventKey).first<Row>();if(!row||row.payload_sha256!==hash)return json({error:'Webhook event identity conflicts with its saved payload.'},409);
 // Queue failure cannot lose accepted work: the scheduled scanner owns durable retry.
 if(row.state!=='processed'&&row.state!=='review')await env.BILLING_OPS_QUEUE?.send({kind:'inbox',eventKey} as never).catch(()=>undefined);
 return json({ok:true,durable:true,eventKey,idempotent:row.state==='processed'},202);
}
async function resolveLocal(env:Env,payload:Row){
 const data=payload.payload as {subscription?:{entity?:Row};payment?:{entity?:Row};refund?:{entity?:Row};dispute?:{entity?:Row}}|undefined;
 const embedded=data?.subscription?.entity,payment=data?.payment?.entity;
 let subscriptionId=String(embedded?.id||payment?.subscription_id||'');
 if(!subscriptionId&&payment?.invoice_id){const invoice=await provider(env,`invoices/${encodeURIComponent(String(payment.invoice_id))}`);if(invoice.id!==payment.invoice_id)throw new Error('invoice_identity_mismatch');subscriptionId=String(invoice.subscription_id||'');}
 const paymentId=String(payment?.id||data?.refund?.entity?.payment_id||data?.dispute?.entity?.payment_id||'');
 if(!subscriptionId&&paymentId){const charge=await env.DB!.prepare('SELECT provider_subscription_id FROM razorpay_subscription_charges WHERE provider_payment_id=?1').bind(paymentId).first<Row>();subscriptionId=String(charge?.provider_subscription_id||'');}
 let local=subscriptionId?await env.DB!.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1').bind(subscriptionId).first<Row>():null;
 const notes=embedded?.notes as Row|undefined;
 if(!local&&subscriptionId&&notes?.checkout_key&&notes.ca_progress_user_id){const attempt=await env.DB!.prepare("SELECT id FROM payment_checkout_attempts WHERE request_key=?1 AND user_id=?2 AND state IN ('dispatching','uncertain','provider_created')").bind(notes.checkout_key,notes.ca_progress_user_id).first<Row>();if(attempt)await recoverCheckout(env.DB!,String(notes.ca_progress_user_id),String(attempt.id),dependencies(env,String(notes.ca_progress_user_id)),subscriptionId);local=await env.DB!.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1').bind(subscriptionId).first<Row>();if(!local)throw new Error('checkout_projection_pending');}
 return {local,paymentId};
}
async function reconcileKnown(env:Env,local:Row,paymentId:string|null,eventType:string){
 const id=String(local.provider_subscription_id),sub=await provider(env,`subscriptions/${encodeURIComponent(id)}`),payment=paymentId?await provider(env,`payments/${encodeURIComponent(paymentId)}`):null;
 const result=local.campaign_claim_id?await campaignReconcile(env,sub as never,payment as never,eventType):await reconcile(env,sub as never,payment as never,eventType);
 if((result as {pending?:boolean;mismatch?:boolean}).pending||(result as {mismatch?:boolean}).mismatch)throw new Error(String((result as {reason?:string}).reason||'renewal_evidence_pending'));
 return result;
}
async function processInbox(env:Env,eventKey:string){
 const db=env.DB!,token=crypto.randomUUID(),time=stamp(),until=new Date(Date.now()+300000).toISOString();
 const claim=await db.prepare("UPDATE billing_webhook_inbox SET state='processing',lease_token=?1,lease_until=?2,attempts=attempts+1,updated_at=?3 WHERE event_key=?4 AND state IN ('received','retry','processing') AND available_at<=?3 AND (lease_until IS NULL OR lease_until<=?3)").bind(token,until,time,eventKey).run();
 if(Number(claim.meta?.changes??0)!==1){const row=await db.prepare('SELECT state FROM billing_webhook_inbox WHERE event_key=?1').bind(eventKey).first<Row>();if(!row||row.state==='processed'||row.state==='review')return;throw new Error('inbox_processing_or_backoff');}
 const row=await db.prepare('SELECT * FROM billing_webhook_inbox WHERE event_key=?1').bind(eventKey).first<Row>();
 try{
  const payload=JSON.parse(String(row!.raw_body)) as Row,{local,paymentId}=await resolveLocal(env,payload),eventType=String(payload.event);
  if(local&&!eventType.startsWith('refund.')&&!eventType.startsWith('payment.dispute.')){
   await db.prepare("INSERT OR IGNORE INTO razorpay_subscription_events(id,provider_event_id,razorpay_subscription_id,provider_subscription_id,provider_payment_id,event_type,payload_sha256,evidence_json,outcome,received_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'received',?9)").bind(crypto.randomUUID(),eventKey,local.id,local.provider_subscription_id,paymentId||null,eventType,row!.payload_sha256,JSON.stringify({source:'durable_inbox',subscription_id:local.provider_subscription_id}),stamp()).run();
   await reconcileKnown(env,local,paymentId||null,eventType);
   await db.prepare("UPDATE razorpay_subscription_events SET outcome='reconciled',error_code=NULL,processed_at=?1 WHERE provider_event_id=?2").bind(stamp(),eventKey).run();
  }
  else{
   // Legacy one-time payments and finance events retain their existing handler.
   const signature=await sign(env.RAZORPAY_WEBHOOK_SECRET!,new TextEncoder().encode(String(row!.raw_body)).buffer);
   const response=await previous.fetch(new Request('https://billing.internal/webhook',{method:'POST',headers:{'x-ca-progress-internal':'ca-progress-v2-web','x-razorpay-signature':signature,'x-razorpay-event-id':eventKey,'content-type':'application/json'},body:String(row!.raw_body)}),{...env,BILLING_OPS_QUEUE:undefined});
   const result=await response.json() as {reconciliation?:{pending?:boolean;mismatch?:boolean}};if(!response.ok||result.reconciliation?.pending||result.reconciliation?.mismatch)throw new Error('legacy_reconciliation_pending');
  }
  await db.prepare("UPDATE billing_webhook_inbox SET state='processed',processed_at=?1,updated_at=?1,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE event_key=?2 AND lease_token=?3").bind(stamp(),eventKey,token).run();
 }catch(error){
  const attempts=Number(row?.attempts??1),review=attempts>=12,available=new Date(Date.now()+Math.min(3600000,30000*2**Math.min(attempts-1,7))).toISOString();
  await db.prepare("UPDATE razorpay_subscription_events SET outcome='failed',error_code='durable_inbox_retry',processed_at=?1 WHERE provider_event_id=?2").bind(stamp(),eventKey).run();
  await db.prepare("UPDATE billing_webhook_inbox SET state=?1,available_at=?2,last_error=?3,lease_token=NULL,lease_until=NULL,updated_at=?4 WHERE event_key=?5 AND lease_token=?6").bind(review?'review':'retry',available,error instanceof Error?error.message.slice(0,200):'processing_failed',stamp(),eventKey,token).run();throw error;
 }
}
export async function dispatchAccessOutbox(env:Env){
 const rows=await env.DB!.prepare("SELECT id FROM billing_access_outbox WHERE state='pending' ORDER BY id LIMIT 30").all<Row>();
 for(const row of rows.results??[]){const key=`billing-access:${row.id}`;await env.DB!.batch([
  env.DB!.prepare(`INSERT OR IGNORE INTO notification_outbox(id,user_id,kind,payload_json,idempotency_key)
   SELECT ?1,o.user_id,o.kind,o.payload_json,?2 FROM billing_access_outbox o JOIN user_subscriptions s ON s.id=o.access_subscription_id
   WHERE o.id=?3 AND o.state='pending' AND s.plan_id=json_extract(o.payload_json,'$.planId') AND s.status=json_extract(o.payload_json,'$.status') AND s.starts_at=json_extract(o.payload_json,'$.startsAt') AND s.ends_at=json_extract(o.payload_json,'$.endsAt')`).bind(crypto.randomUUID(),key,row.id),
  env.DB!.prepare("UPDATE billing_access_outbox SET state='delivered' WHERE id=?1 AND state='pending' AND EXISTS(SELECT 1 FROM notification_outbox WHERE idempotency_key=?2)").bind(row.id,key)
 ]);}
}
async function replayEvent(request:Request,env:Env){
 const actor=request.headers.get('x-ca-progress-user-id'),role=request.headers.get('x-ca-progress-actor-role');
 if(!actor||!['owner','parent_owner'].includes(role??''))return json({error:'Owner billing authority is required.'},403);
 let body:Row;try{body=JSON.parse(new TextDecoder().decode(await readWebhookBytes(request,4096)));}catch{return json({error:'Invalid replay request.'},400);}
 const {eventKey,requestId,reason}=body??{};if(typeof eventKey!=='string'||eventKey.length>200||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)||typeof reason!=='string'||reason.trim().length<8||reason.length>1000)return json({error:'Event, unique request ID and a review reason are required.'},400);
 const db=env.DB!,prior=await db.prepare('SELECT * FROM billing_inbox_replays WHERE request_key=?1').bind(requestId).first<Row>();
 if(prior){if(prior.event_key!==eventKey||prior.actor_user_id!==actor||prior.reason!==reason)return json({error:'Replay request ID conflicts with its original operation.'},409);return json({ok:true,idempotent:true});}
 const time=stamp();await db.batch([
  db.prepare("INSERT INTO billing_inbox_replays(request_key,event_key,actor_user_id,reason,replayed_at) SELECT ?1,event_key,?2,?3,?4 FROM billing_webhook_inbox WHERE event_key=?5 AND state IN ('retry','review')").bind(requestId,actor,reason,time,eventKey),
  db.prepare("UPDATE billing_webhook_inbox SET state='received',attempts=0,lease_token=NULL,lease_until=NULL,available_at=?1,updated_at=?1,last_error=NULL WHERE event_key=?2 AND state IN ('retry','review') AND EXISTS(SELECT 1 FROM billing_inbox_replays WHERE request_key=?3)").bind(time,eventKey,requestId)
 ]);
 const saved=await db.prepare('SELECT request_key FROM billing_inbox_replays WHERE request_key=?1').bind(requestId).first();if(!saved)return json({error:'Only retry or review events can be replayed.'},409);
 await env.BILLING_OPS_QUEUE?.send({kind:'inbox',eventKey} as never).catch(()=>undefined);return json({ok:true,queued:true},202);
}
const worker={
 async fetch(request:Request,env:Env){
  if(request.headers.get('x-ca-progress-internal')!=='ca-progress-v2-web')return json({error:'Internal billing service only.'},403);
  if(request.method==='POST'&&new URL(request.url).pathname==='/admin/replay-event'){try{return await replayEvent(request,env);}catch{return json({error:'Replay could not be committed.'},503);}}
  if(request.method==='GET'&&new URL(request.url).pathname==='/health'&&env.DB){
   const inbox=await env.DB.prepare('SELECT state,COUNT(*) n FROM billing_webhook_inbox GROUP BY state').all<Row>(),outbox=await env.DB.prepare('SELECT state,COUNT(*) n FROM billing_access_outbox GROUP BY state').all<Row>();
   return json({ok:true,databaseConfigured:true,providerConfigured:Boolean(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET),webhookConfigured:Boolean(env.RAZORPAY_WEBHOOK_SECRET),phase:4,inbox:inbox.results??[],outbox:outbox.results??[]});
  }
  if(request.method==='POST'&&new URL(request.url).pathname==='/webhook'){try{return await ingest(request,env);}catch{return json({error:'Webhook could not be persisted. Retry delivery.'},503);}}
  return previous.fetch(request,env);
 },
 async queue(batch:{messages:Message[]},env:Env){for(const message of batch.messages){try{
  const job=message.body;
  if(job.kind==='inbox')await processInbox(env,job.eventKey);
  else if(job.kind==='webhook'){
   const headers:Record<string,string>={'x-razorpay-signature':job.signature};if(job.eventId)headers['x-razorpay-event-id']=job.eventId;
   const response=await ingest(new Request('https://billing.internal/webhook',{method:'POST',headers,body:job.raw}),env);if(!response.ok)throw new Error('legacy_queue_ingestion_failed');
  }else{const local=await env.DB!.prepare('SELECT * FROM razorpay_subscriptions WHERE provider_subscription_id=?1 AND user_id=?2').bind(job.subscriptionId,job.userId).first<Row>();if(!local)throw new Error('subscription_owner_missing');await reconcileKnown(env,local,null,`reconcile.${job.reason}`);}
  message.ack();
 }catch{message.retry();}}
 await dispatchAccessOutbox(env);
 },
 async scheduled(_controller:{scheduledTime:number},env:Env){
  const db=env.DB!;
  await db.prepare('DELETE FROM billing_webhook_rate_windows WHERE window_start<?1').bind(Math.floor(Date.now()/60000)-1440).run();
  const inbox=await db.prepare("SELECT event_key FROM billing_webhook_inbox WHERE state IN ('received','retry','processing') AND available_at<=?1 AND (lease_until IS NULL OR lease_until<=?1) ORDER BY received_at LIMIT 20").bind(stamp()).all<Row>();for(const row of inbox.results??[])await processInbox(env,String(row.event_key)).catch(()=>undefined);
  const attempts=await db.prepare("SELECT id,user_id FROM payment_checkout_attempts WHERE state IN ('dispatching','uncertain','provider_created','ready','pending') AND (lease_until IS NULL OR lease_until<?1) ORDER BY updated_at LIMIT 5").bind(stamp()).all<Row>();for(const row of attempts.results??[])await recoverCheckout(db,String(row.user_id),String(row.id),dependencies(env,String(row.user_id))).catch(()=>undefined);
  const rows=await db.prepare(`SELECT * FROM razorpay_subscriptions WHERE financial_state NOT IN ('refunded','disputed') AND (
   last_reconciled_at IS NULL OR (status IN ('created','authenticated','pending','halted') OR renewal_evidence_error IS NOT NULL) AND datetime(updated_at)<datetime('now','-5 minutes')
   OR status IN ('active','paused') AND datetime(last_reconciled_at)<datetime('now','-2 hours')
   OR status IN ('cancelled','completed','expired') AND paid_through_at IS NOT NULL AND datetime(last_reconciled_at)<datetime('now','-2 hours') AND datetime(paid_through_at)>datetime('now','-1 day'))
   ORDER BY COALESCE(last_reconciled_at,created_at) LIMIT 15`).all<Row>();for(const local of rows.results??[])await reconcileKnown(env,local,null,'reconcile.missed_event').catch(()=>undefined);
  await dispatchAccessOutbox(env);
 }
};
export default worker;
