import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {fixture} from './helpers/payment-worker-fixture.mjs';
import {saveUpgradeQuote,saveIntroQuote} from '../lib/billing/upgrade-engine.mjs';
const dir=await mkdtemp(join(tmpdir(),'upgrade-worker-')),file=join(dir,'worker.mjs');
await build({entryPoints:['workers/billing/payment-p5.ts'],outfile:file,bundle:true,format:'esm',platform:'neutral'});
const worker=(await import(pathToFileURL(file))).default;
after(()=>rm(dir,{recursive:true,force:true}));
async function setup({direct=false,method='card'}={}){
 const f=fixture(worker),{sql,db}=f;
 sql.exec("UPDATE subscription_plans SET tier_key='basic',billing_cycle='monthly',currency='INR';INSERT INTO subscription_plans VALUES('pro','pro','monthly','INR');");
 sql.exec("ALTER TABLE plan_policy_versions ADD COLUMN price_subunits INTEGER;ALTER TABLE plan_policy_versions ADD COLUMN currency TEXT;ALTER TABLE plan_policy_versions ADD COLUMN billing_duration_value INTEGER;ALTER TABLE plan_policy_versions ADD COLUMN name TEXT;ALTER TABLE plan_policy_versions ADD COLUMN grace_days INTEGER;INSERT INTO plan_policy_versions VALUES('pvpro','pro',15000,'INR',1,'Pro',3);");
 sql.exec("INSERT INTO subscription_upgrade_offers(plan_id,intro_price_subunits,currency,state,version) VALUES('pro',5000,'INR','published',1);");
 await f.sync();sql.exec("UPDATE payment_subscription_cycles SET provider_mode='live';INSERT INTO razorpay_plan_mappings(id,policy_version_id,internal_plan_id,price_kind,provider_plan_id,period,interval_value,amount_subunits,currency,state) VALUES('mappingpro','pvpro','pro','recurring','plan_Pro','monthly',1,15000,'INR','ready');");
 f.env.RAZORPAY_KEY_ID='rzp_live_fixture';f.sub.notes={ca_progress_user_id:'user1'};let order=null,replacement=null,latePayment=null,lateInvoice=null;const calls=[];
 globalThis.fetch=async(url,init={})=>{
  const path=new URL(url).pathname;calls.push({path,method:init.method??'GET'});
  if(path==='/v1/plans/plan_Pro')return Response.json({id:'plan_Pro',period:'monthly',interval:1,item:{amount:15000,currency:'INR'}});
  if(path==='/v1/subscriptions/sub_1/cancel'){f.sub.status='cancelled';return Response.json(f.sub);}
  if(path==='/v1/subscriptions/sub_1')return Response.json(f.sub);
  if(path==='/v1/payments/pay_Late')return Response.json(latePayment);
  if(path==='/v1/invoices/inv_Late')return Response.json(lateInvoice);
  if(path==='/v1/invoices/inv_1')return Response.json(f.invoices[0]);
  if(path==='/v1/payments/pay_1')return Response.json(f.payments.get('pay_1'));
  if(path==='/v1/orders'&&init.method==='POST'){order={...JSON.parse(init.body),id:'order_Upgrade'};return Response.json(order);}
  if(path==='/v1/orders/order_Upgrade/payments')return Response.json({items:[]});
  if(path==='/v1/orders/order_Upgrade')return Response.json(order);
  if(path==='/v1/payments/pay_Upgrade')return Response.json({id:'pay_Upgrade',order_id:order.id,amount:order.amount,currency:'INR',status:'captured',amount_refunded:0,created_at:Math.floor(Date.now()/1000)});
  if(path==='/v1/subscriptions'&&init.method==='POST'){assert.equal(f.sub.status,'cancelled');replacement={...JSON.parse(init.body),id:'sub_Pro',status:'created',paid_count:0,remaining_count:12};return Response.json(replacement);}
  if(path==='/v1/subscriptions/sub_Pro')return Response.json(replacement);
  throw new Error('Unexpected provider request '+path);
 };
 const request=(action,quoteId,proof={})=>worker.fetch(new Request('https://billing.internal/upgrade',{method:'POST',headers:{'x-ca-progress-internal':'ca-progress-v2-web','x-ca-progress-user-id':'user1','content-type':'application/json'},body:JSON.stringify({action,quoteId,...proof})}),f.env);
 if(direct){sql.exec("UPDATE razorpay_subscriptions SET status='cancelled';UPDATE user_subscriptions SET status='expired'");f.sub.status='cancelled';}
 const quote=await (direct?saveIntroQuote:saveUpgradeQuote)(db,'user1',{planId:'pro',policyVersionId:'pvpro',recurringPriceSubunits:15000,currency:'INR'},method);
 return {...f,quote,request,calls,makeLateRenewal(){lateInvoice={...f.invoices[0],id:'inv_Late',payment_id:'pay_Late',billing_start:f.invoices[0].billing_end,billing_end:f.invoices[0].billing_end+30*86400,amount:5000,amount_paid:5000};latePayment={id:'pay_Late',subscription_id:'sub_1',invoice_id:'inv_Late',order_id:'order_Late',amount:5000,currency:'INR',status:'captured',amount_refunded:0,created_at:lateInvoice.billing_start};return latePayment;},get replacement(){return replacement;}};
}
test('real worker verifies upgrade signature, preserves Basic until captured, and creates one future renewal only after old cancellation',async()=>{const f=await setup();try{
 let response=await f.request('pay',f.quote.quoteId);assert.equal(response.status,200);assert.equal((await response.json()).upgrade.accessGranted,false);
 response=await f.request('verify',f.quote.quoteId,{razorpay_order_id:'order_Upgrade',razorpay_payment_id:'pay_Upgrade',razorpay_signature:'wrong'});assert.equal(response.status,400);assert.equal(f.sub.status,'active');
 const signature=createHmac('sha256','fixture-secret').update('order_Upgrade|pay_Upgrade').digest('hex');
 response=await f.request('verify',f.quote.quoteId,{razorpay_order_id:'order_Upgrade',razorpay_payment_id:'pay_Upgrade',razorpay_signature:signature});assert.equal(response.status,200);assert.equal((await response.json()).upgrade.accessGranted,true);assert.equal(f.sub.status,'cancelled');
 response=await f.request('renewal',f.quote.quoteId);let result=await response.json();assert.equal(response.status,200,JSON.stringify({result,attempts:f.sql.prepare('SELECT * FROM payment_checkout_attempts').all(),calls:f.calls}));assert.equal(result.checkout.subscriptionId,'sub_Pro');assert.equal(result.checkout.paymentMethod,'card');assert.equal(f.replacement.start_at,Math.floor(Date.parse(f.quote.quote.nextRenewalAt)/1000));assert.equal(f.replacement.plan_id,'plan_Pro');assert.equal(f.replacement.offer_id,undefined);
 f.replacement.status='authenticated';response=await f.request('confirm_renewal',f.quote.quoteId);assert.equal(response.status,200);assert.equal((await response.json()).upgrade.renewalReady,true);
 response=await f.request('renewal',f.quote.quoteId);assert.equal(response.status,200);assert.equal(f.calls.filter(c=>c.path==='/v1/subscriptions'&&c.method==='POST').length,1);
 assert.equal(f.sql.prepare("SELECT ends_at FROM user_subscriptions WHERE plan_id='pro' AND source_order_id='order_Upgrade'").get().ends_at,f.quote.quote.nextRenewalAt);
 }finally{f.cleanup();}});

test('signed late old-mandate charge queues an exact refund and cannot extend Basic access',async()=>{const f=await setup();try{
 await f.request('pay',f.quote.quoteId);await f.request('verify',f.quote.quoteId,{razorpay_order_id:'order_Upgrade',razorpay_payment_id:'pay_Upgrade',razorpay_signature:createHmac('sha256','fixture-secret').update('order_Upgrade|pay_Upgrade').digest('hex')});
 const oldEnd=f.sql.prepare("SELECT ends_at FROM user_subscriptions WHERE plan_id='basic'").get().ends_at,payment=f.makeLateRenewal();
 const body=JSON.stringify({event:'subscription.charged',payload:{subscription:{entity:f.sub},payment:{entity:payment}}});
 const response=await worker.fetch(new Request('https://billing.internal/webhook',{method:'POST',headers:{'x-ca-progress-internal':'ca-progress-v2-web','x-razorpay-signature':createHmac('sha256','fixture-webhook').update(body).digest('hex'),'x-razorpay-event-id':'late-old-renewal'},body}),f.env);assert.equal(response.status,202);
 let acked=false;await worker.queue({messages:[{body:{kind:'inbox',eventKey:'late-old-renewal'},ack(){acked=true;},retry(){}}]},f.env);assert.equal(acked,true);
 assert.equal(f.sql.prepare("SELECT amount_subunits FROM subscription_refund_obligations WHERE payment_id='pay_Late'").get().amount_subunits,5000);
 assert.equal(f.sql.prepare("SELECT ends_at FROM user_subscriptions WHERE plan_id='basic'").get().ends_at,oldEnd);
 }finally{f.cleanup();}});

test('direct Pro capture activates a full month and creates one future UPI mandate at regular price without a second first-month charge',async()=>{const f=await setup({direct:true,method:'upi'});try{
 let response=await f.request('pay',f.quote.quoteId);assert.equal(response.status,200);assert.equal((await response.json()).upgrade.quote.amountDueSubunits,5000);
 const body=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_Upgrade',order_id:'order_Upgrade',status:'captured'}}}});
 response=await worker.fetch(new Request('https://billing.internal/webhook',{method:'POST',headers:{'x-ca-progress-internal':'ca-progress-v2-web','x-razorpay-signature':createHmac('sha256','fixture-webhook').update(body).digest('hex'),'x-razorpay-event-id':'direct-pro-capture'},body}),f.env);assert.equal(response.status,202);
 let acked=false;await worker.queue({messages:[{body:{kind:'inbox',eventKey:'direct-pro-capture'},ack(){acked=true;},retry(){}}]},f.env);assert.equal(acked,true);
 const access=f.sql.prepare("SELECT * FROM user_subscriptions WHERE plan_id='pro'").get();assert.equal(access.status,'active');
 response=await f.request('renewal',f.quote.quoteId);const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.checkout.paymentMethod,'upi');assert.equal(result.checkout.subscriptionId,'sub_Pro');assert.equal(f.replacement.start_at,Math.floor(Date.parse(access.ends_at)/1000));assert.equal(f.replacement.offer_id,undefined);assert.equal(f.replacement.addons,undefined);
 f.replacement.status='authenticated';response=await f.request('confirm_renewal',f.quote.quoteId);assert.equal(response.status,200);assert.equal((await response.json()).upgrade.renewalReady,true);
 assert.equal(f.calls.filter(c=>c.path==='/v1/orders'&&c.method==='POST').length,1);assert.equal(f.calls.filter(c=>c.path==='/v1/subscriptions'&&c.method==='POST').length,1);assert.equal(f.calls.filter(c=>c.path.includes('/cancel')).length,0);
 }finally{f.cleanup();}});
