import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {fixture} from './helpers/payment-worker-fixture.mjs';
import {maintainRecovery} from '../lib/billing/recovery-maintenance.mjs';
import {maintainCollectionDeadlines,maintainCommercialChanges} from '../lib/billing/collection-maintenance.mjs';
import {cancellationRefundEvent} from '../lib/billing/cancellation-policy.mjs';
import {priceApproval} from '../lib/billing/price-approval.mjs';
const dir=await mkdtemp(join(tmpdir(),'owner-renewals-')),file=join(dir,'worker.mjs');
await build({entryPoints:['workers/billing/payment-p5.ts'],outfile:file,bundle:true,format:'esm',platform:'neutral'});
const worker=(await import(pathToFileURL(file))).default;
after(()=>rm(dir,{recursive:true,force:true}));
async function setup({expired=false,annual=false}={}){
 const f=fixture(worker);f.sub.notes={ca_progress_user_id:'user1',checkout_key:'checkout_request_001'};
 f.sql.exec(`ALTER TABLE subscription_plans ADD COLUMN name TEXT DEFAULT 'Striver';
 ALTER TABLE plan_policy_versions ADD COLUMN price_subunits INTEGER DEFAULT 5000;
 ALTER TABLE plan_policy_versions ADD COLUMN name TEXT DEFAULT 'Striver';
 ALTER TABLE plan_policy_versions ADD COLUMN currency TEXT DEFAULT 'INR';
 ALTER TABLE plan_policy_versions ADD COLUMN billing_duration_value INTEGER DEFAULT 1;
 ALTER TABLE plan_policy_versions ADD COLUMN billing_duration_unit TEXT DEFAULT 'month';
 ALTER TABLE plan_policy_versions ADD COLUMN grace_days INTEGER DEFAULT 3;
 ALTER TABLE plan_policy_versions ADD COLUMN state TEXT DEFAULT 'published';
 ALTER TABLE plan_policy_versions ADD COLUMN effective_at TEXT;
 ALTER TABLE plan_policy_versions ADD COLUMN published_at TEXT DEFAULT '2026-01-01';
 ALTER TABLE plan_policy_versions ADD COLUMN created_at TEXT DEFAULT '2026-01-01';
 ALTER TABLE plan_policy_versions ADD COLUMN created_by TEXT DEFAULT 'user1';
 ALTER TABLE plan_policy_versions ADD COLUMN version INTEGER DEFAULT 1;`);
 if(expired){const end=Math.floor(Date.now()/1000)-3600,start=end-(annual?365:28)*86400;Object.assign(f.invoices[0],{billing_start:start,billing_end:end});Object.assign(f.sub,{current_start:start,current_end:end});f.payments.get('pay_1').created_at=start;}
 if(annual)f.sql.exec("UPDATE razorpay_subscriptions SET billing_cycle='annual',grace_days=10");
 assert.equal((await f.sync()).status,200);
 return f;
}
function nextPayment(f){const first=f.invoices[0],next={...first,id:'inv_2',payment_id:'pay_2',billing_start:first.billing_end,billing_end:first.billing_end+28*86400,amount:5000,amount_paid:5000};f.invoices.push(next);f.payments.set('pay_2',{...f.payments.get('pay_1'),id:'pay_2',invoice_id:'inv_2',amount:5000,created_at:next.billing_start});Object.assign(f.sub,{paid_count:2,current_start:next.billing_start,current_end:next.billing_end});return next;}
test('monthly three-day and annual ten-day grace retain the invoice anchor',async()=>{
 for(const [annual,days] of [[false,3],[true,10]]){const f=await setup({expired:true,annual});try{f.sub.status='halted';await f.sync();const row=f.sql.prepare('SELECT * FROM razorpay_subscriptions').get();assert.equal(Date.parse(row.grace_until)-Date.parse(row.paid_through_at),days*86400000);for(let i=0;i<2;i++)await f.sync();assert.equal(f.sql.prepare('SELECT grace_until FROM razorpay_subscriptions').get().grace_until,row.grace_until);}finally{f.cleanup();}}
});
test('daily reminders dedupe, survive unchanged failure reconciliation, and stop on recovery',async()=>{
 const f=await setup({expired:true});try{
  f.sub.status='pending';await f.sync();const first=f.sql.prepare("SELECT * FROM billing_notifications WHERE notification_type='billing_payment_failed'").get();
  const now=new Date(Date.parse(first.created_at)+86400000).toISOString();await maintainRecovery(f.db,now);await maintainRecovery(f.db,now);
  const daily=f.sql.prepare("SELECT * FROM billing_notifications WHERE cycle_key LIKE '%:day:%'").all();assert.equal(daily.length,1);assert.equal(daily[0].suppressed_at,null);
  await f.sync();assert.equal(f.sql.prepare("SELECT suppressed_at FROM billing_notifications WHERE cycle_key LIKE '%:day:%'").get().suppressed_at,null);
  nextPayment(f);f.sub.status='active';await f.sync();assert.ok(f.sql.prepare("SELECT suppressed_at FROM billing_notifications WHERE cycle_key LIKE '%:day:%'").get().suppressed_at);
 }finally{f.cleanup();}
});
test('collection stops exactly seven days after grace and cannot cancel a different owner',async()=>{
 const f=await setup({expired:true});try{
  f.sub.status='halted';await f.sync();const row=f.sql.prepare('SELECT * FROM razorpay_subscriptions').get(),end=Date.parse(row.grace_until)+7*86400000;let posts=0;
  const provider=async(path,init)=>{if(init){posts++;assert.equal(JSON.parse(init.body).cancel_at_cycle_end,0);f.sub.status='cancelled';}return f.sub;};
  await maintainCollectionDeadlines(f.db,provider,new Date(end-1).toISOString());assert.equal(posts,0);
  await maintainCollectionDeadlines(f.db,provider,new Date(end).toISOString());assert.equal(posts,1);
  await maintainCollectionDeadlines(f.db,provider,new Date(end+1).toISOString());assert.equal(posts,1);
  assert.ok(f.sql.prepare('SELECT confirmed_at FROM subscription_collection_stops').get().confirmed_at);
  // An in-flight recovery still belongs to its original service period after the stop.
  const invoice=nextPayment(f);await f.sync();assert.equal(f.sql.prepare('SELECT ends_at FROM user_subscriptions').get().ends_at,new Date(invoice.billing_end*1000).toISOString());
 }finally{f.cleanup();}
});
test('cancellation during grace immediately expires access; late captured renewal is fully refundable',async()=>{
 const f=await setup({expired:true});try{
  f.sub.status='pending';await f.sync();const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{if(new URL(url).pathname==='/v1/subscriptions/sub_1/cancel'){assert.equal(JSON.parse(init.body).cancel_at_cycle_end,0);f.sub.status='cancelled';return Response.json(f.sub);}return originalFetch(url,init);};
  const response=await worker.fetch(new Request('https://billing.internal/subscription-action',{method:'POST',headers:{'x-ca-progress-internal':'ca-progress-v2-web','x-ca-progress-user-id':'user1','content-type':'application/json'},body:JSON.stringify({subscriptionId:'sub_1',action:'cancel_period_end',requestId:crypto.randomUUID()})}),f.env);
  assert.equal(response.status,200);assert.equal(f.sql.prepare('SELECT status FROM user_subscriptions').get().status,'expired');
  const boundary=new Date(f.invoices[0].billing_end*1000).toISOString();nextPayment(f);await f.sync();await f.sync();
  const refund=f.sql.prepare('SELECT * FROM subscription_cancellation_refunds').get();assert.equal(refund.amount_subunits,5000);assert.equal(refund.payment_id,'pay_2');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM subscription_cancellation_refunds').get().n,1);assert.equal(f.sql.prepare('SELECT ends_at FROM user_subscriptions').get().ends_at,boundary);
 }finally{f.cleanup();}
});
test('lower-price and retirement jobs stop old renewal while preserving paid access',async()=>{
 for(const kind of ['price_decrease','plan_retirement']){const f=await setup();try{
  f.sql.exec("UPDATE plan_policy_versions SET state='retired' WHERE id='pv1';INSERT INTO plan_policy_versions(id,plan_id,price_subunits,version) VALUES('lower','basic',4000,2)");
  const end=new Date(f.invoices[0].billing_end*1000).toISOString(),now=new Date().toISOString();
  f.sql.prepare("INSERT INTO subscription_policy_change_jobs(id,source_subscription_id,user_id,kind,target_policy_id,effective_at,target_price_subunits,approval_grace_days,state,reason,created_by,created_at,updated_at) VALUES('job','local1','user1',?,'lower',?,4000,10,'pending','Owner policy','user1',?,?)").run(kind,end,now,now);
  let posts=0;const provider=async(path,init)=>{if(init){posts++;assert.equal(JSON.parse(init.body).cancel_at_cycle_end,1);f.sub.cancel_at_cycle_end=true;}return f.sub;};
  await maintainCommercialChanges(f.db,provider,async()=>{await f.sync();});await maintainCommercialChanges(f.db,provider,async()=>{await f.sync();});assert.equal(posts,1);
  const job=f.sql.prepare("SELECT * FROM subscription_policy_change_jobs WHERE id='job'").get();assert.equal(job.state,kind==='price_decrease'?'awaiting_approval':'applied');
  const access=f.sql.prepare('SELECT ends_at FROM user_subscriptions').get();assert.equal(access.ends_at,kind==='price_decrease'?new Date(Date.parse(end)+10*86400000).toISOString():end);
  if(kind==='price_decrease'){const input={priceChangeId:'job',planId:'basic',policyVersionId:'lower',paymentMethod:'upi',promoCode:''};const approval=await priceApproval(f.db,'user1',input);assert.equal(approval.terms.recurringPrice,4000);await assert.rejects(priceApproval(f.db,'foreign',input),{code:'price_approval_unavailable'});}
 }finally{f.cleanup();}}
});
test('refund confirmation for a cancelled later invoice preserves an earlier paid period',async()=>{
 const f=await setup();try{
  const before={...f.sql.prepare('SELECT * FROM user_subscriptions').get()},local=f.sql.prepare('SELECT * FROM razorpay_subscriptions').get();
  f.sql.exec("INSERT INTO subscription_cancellation_refunds(payment_id,purchase_group_id,amount_subunits,currency,state,request_key) VALUES('pay_Late','local1',5000,'INR','requested','cancelled_renewal_pay_Late')");
  const provider=async path=>path.startsWith('refunds/')?{id:'rfnd_Late',payment_id:'pay_Late',amount:5000,status:'processed',notes:{ca_progress_refund_request:'cancelled_renewal_pay_Late'}}:{id:'pay_Late',subscription_id:'sub_1',amount:5000,currency:'INR',status:'captured'};
  assert.equal(await cancellationRefundEvent(f.db,provider,{event:'refund.processed',payload:{refund:{entity:{id:'rfnd_Late'}}}},local,'pay_Late'),true);
  assert.deepEqual({...f.sql.prepare('SELECT * FROM user_subscriptions').get()},before);assert.equal(f.sql.prepare('SELECT financial_state FROM razorpay_subscriptions').get().financial_state,'paid');
 }finally{f.cleanup();}
});
