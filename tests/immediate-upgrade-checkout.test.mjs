import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fixture} from './helpers/payment-worker-fixture.mjs';
import {saveUpgradeQuote,saveIntroQuote,acceptUpgrade,ownedUpgrade,verifyUpgradePayment,recoverUpgrade,proOfferEligible,tierOfferEligible} from '../lib/billing/upgrade-engine.mjs';
import {maintainUpgradeRefunds} from '../lib/billing/upgrade-refunds.mjs';
function setup(introMigration=true){
 const f=fixture({fetch(){}},{introMigration}),{sql}=f;
 sql.exec("UPDATE subscription_plans SET tier_key='basic',billing_cycle='monthly',currency='INR';INSERT INTO subscription_plans VALUES('pro','pro','monthly','INR');INSERT INTO plan_policy_versions VALUES('pvpro','pro');");
 sql.exec("INSERT INTO subscription_upgrade_offers(plan_id,intro_price_subunits,currency,state,version) VALUES('pro',5000,'INR','published',1);");
 sql.exec("UPDATE razorpay_subscriptions SET financial_state='paid',status='active'");
 const i=f.invoices[0],p=f.payments.get('pay_1');
 sql.prepare("INSERT INTO payment_subscription_cycles VALUES('inv_1','local1','sub_1',1,'pay_1',?,?,2500,2500,'INR','verified','upi','live',?,?)").run(new Date(i.billing_start*1000).toISOString(),new Date(i.billing_end*1000).toISOString(),new Date().toISOString(),new Date().toISOString());
 sql.prepare("INSERT INTO razorpay_subscription_charges(provider_payment_id,razorpay_subscription_id,provider_subscription_id,amount_subunits,currency,status) VALUES('pay_1','local1','sub_1',2500,'INR','captured')").run();
 const orders=new Map(),payments=new Map(),refunds=new Map(),calls=[];let cancelFails=false,lostOrder=false;
 f.sub.notes={ca_progress_user_id:'user1'};
 const deps={keyId:'rzp_live_fixture',async provider(path,init={}){
  calls.push({path,method:init.method??'GET',headers:init.headers});
  if(path==='orders'&&init.method==='POST'){const payload=JSON.parse(init.body),o={...payload,id:'order_upgrade'};orders.set(o.id,o);if(lostOrder)throw new Error('lost response');return o;}
  if(path.startsWith('orders?'))return {items:[...orders.values()]};
  if(path==='subscriptions/sub_1')return f.sub;
  if(path==='subscriptions/sub_1/cancel'){if(cancelFails)throw new Error('provider down');f.sub.status='cancelled';return f.sub;}
  if(path==='invoices/inv_1')return i;
  if(path==='payments/pay_1')return p;
  if(path.endsWith('/payments'))return {items:[...payments.values()]};
  if(path.endsWith('/refunds?count=100'))return {items:[...refunds.values()].filter(r=>r.payment_id===path.split('/')[1])};
  if(path.endsWith('/refund')){const body=JSON.parse(init.body),id=path.split('/')[1],r={...body,id:`rfnd_${id.replaceAll('_','')}`,payment_id:id,status:'processed'};refunds.set(r.id,r);payments.get(id).amount_refunded=body.amount;return r;}
  if(path.startsWith('orders/'))return orders.get(path.split('/')[1]);
  if(path.startsWith('payments/'))return payments.get(path.split('/')[1]);
  throw new Error('Unexpected provider path '+path);
 }};
 const target={planId:'pro',policyVersionId:'pvpro',recurringPriceSubunits:15000,currency:'INR'};
 const pay=(id='pay_upgrade',amount)=>{const group=sql.prepare('SELECT quoted_amount_subunits FROM subscription_purchase_groups ORDER BY created_at DESC LIMIT 1').get();const p={id,order_id:'order_upgrade',amount:amount??group.quoted_amount_subunits,currency:'INR',status:'captured',amount_refunded:0,created_at:Math.floor(Date.now()/1000)};payments.set(id,p);return p;};
 return {...f,target,deps,orders,payments,refunds,calls,pay,setCancelFails(value){cancelFails=value;},setLostOrder(value){lostOrder=value;}};
}
test('upgrade quote uses actual captured Basic credit and first Pro price, never admin grants',async()=>{const f=setup();try{const q=await saveUpgradeQuote(f.db,'user1',f.target);assert.equal(q.quote.planChargeSubunits,5000);assert.ok(q.quote.unusedCreditSubunits>0);assert.equal(q.quote.amountDueSubunits,5000-q.quote.unusedCreditSubunits);assert.equal(q.quote.mode,'intro_full_month');assert.equal(q.checkoutReady,true);f.sql.exec("UPDATE razorpay_subscription_charges SET refund_state='full'");await assert.rejects(saveUpgradeQuote(f.db,'user1',f.target),{code:'upgrade_paid_period_required'});}finally{f.cleanup();}});
test('captured upgrade atomically activates fixed access, cancels old renewal, and repeats never extend it',async()=>{const f=setup();try{const q=await saveUpgradeQuote(f.db,'user1',f.target);let view=await acceptUpgrade(f.db,'user1',q.quoteId,f.deps);assert.equal(view.accessGranted,false);f.pay();let row=await ownedUpgrade(f.db,'user1',q.quoteId);view=await verifyUpgradePayment(f.db,row,'pay_upgrade',f.deps);assert.equal(view.accessGranted,true);assert.equal(view.sourceCancelled,true);assert.equal(f.sub.status,'cancelled');const access=f.sql.prepare('SELECT * FROM user_subscriptions').get();assert.equal(access.ends_at,q.quote.nextRenewalAt);await verifyUpgradePayment(f.db,await ownedUpgrade(f.db,'user1',q.quoteId),'pay_upgrade',f.deps);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM user_subscriptions').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM subscription_events').get().n,1);assert.equal(await proOfferEligible(f.db,'user1'),false);assert.equal(f.sql.prepare('SELECT ends_at FROM user_subscriptions').get().ends_at,access.ends_at);}finally{f.cleanup();}});
test('wrong amount, foreign owner and uncaptured payment never grant or cancel',async()=>{const f=setup();try{const q=await saveUpgradeQuote(f.db,'user1',f.target);await acceptUpgrade(f.db,'user1',q.quoteId,f.deps);assert.equal(await ownedUpgrade(f.db,'foreign',q.quoteId),null);f.pay('pay_wrong',100);const row=await ownedUpgrade(f.db,'user1',q.quoteId);await assert.rejects(verifyUpgradePayment(f.db,row,'pay_wrong',f.deps),{code:'upgrade_payment_pending'});f.pay('pay_pending').status='authorized';await assert.rejects(verifyUpgradePayment(f.db,row,'pay_pending',f.deps),{code:'upgrade_payment_pending'});assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM user_subscriptions').get().n,0);assert.equal(f.sub.status,'active');}finally{f.cleanup();}});
test('lost order response is recovered by immutable receipt without another POST',async()=>{const f=setup();try{const q=await saveUpgradeQuote(f.db,'user1',f.target);f.setLostOrder(true);await assert.rejects(acceptUpgrade(f.db,'user1',q.quoteId,f.deps));f.setLostOrder(false);const view=await acceptUpgrade(f.db,'user1',q.quoteId,f.deps);assert.equal(view.orderId,'order_upgrade');assert.equal(f.calls.filter(c=>c.path==='orders'&&c.method==='POST').length,1);}finally{f.cleanup();}});
test('late captured duplicate is refunded once and cannot extend or replace winner access',async()=>{const f=setup();try{const q=await saveUpgradeQuote(f.db,'user1',f.target);await acceptUpgrade(f.db,'user1',q.quoteId,f.deps);f.pay();await verifyUpgradePayment(f.db,await ownedUpgrade(f.db,'user1',q.quoteId),'pay_upgrade',f.deps);f.pay('pay_late');for(let i=0;i<2;i++)await verifyUpgradePayment(f.db,await ownedUpgrade(f.db,'user1',q.quoteId),'pay_late',f.deps);assert.equal(f.sql.prepare('SELECT winning_payment_id FROM subscription_purchase_groups').get().winning_payment_id,'pay_upgrade');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM subscription_refund_obligations').get().n,1);await maintainUpgradeRefunds(f.db,f.deps);await maintainUpgradeRefunds(f.db,f.deps);assert.equal(f.refunds.size,1);assert.equal(f.sql.prepare('SELECT state FROM subscription_refund_obligations').get().state,'processed');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM user_subscriptions').get().n,1);}finally{f.cleanup();}});
test('provider cancellation failure preserves paid Pro and remains recoverable',async()=>{const f=setup();try{const q=await saveUpgradeQuote(f.db,'user1',f.target);await acceptUpgrade(f.db,'user1',q.quoteId,f.deps);f.pay();f.setCancelFails(true);await assert.rejects(verifyUpgradePayment(f.db,await ownedUpgrade(f.db,'user1',q.quoteId),'pay_upgrade',f.deps));assert.equal(f.sql.prepare('SELECT status FROM user_subscriptions').get().status,'active');assert.equal(f.sql.prepare('SELECT source_cancelled_at FROM subscription_upgrades').get().source_cancelled_at,null);f.setCancelFails(false);const result=await recoverUpgrade(f.db,'user1',q.quoteId,f.deps);assert.equal(result.sourceCancelled,true);}finally{f.cleanup();}});

test('used Pro offer switches to proration and preserves the existing renewal date',async()=>{const f=setup();try{f.sql.exec("INSERT INTO subscription_purchase_groups(id,user_id,plan_id,policy_snapshot_json,quoted_amount_subunits,currency,winning_payment_id,state) VALUES('oldpro','user1','pro','{}',5000,'INR','pay_previouspro','paid')");const q=await saveUpgradeQuote(f.db,'user1',f.target);assert.equal(q.quote.mode,'remaining_paid_period');assert.equal(q.quote.nextRenewalAt,new Date(f.invoices[0].billing_end*1000).toISOString());assert.equal(q.quote.amountDueSubunits,q.quote.planChargeSubunits-q.quote.unusedCreditSubunits);}finally{f.cleanup();}});

function direct(f){f.sql.exec("UPDATE razorpay_subscriptions SET status='expired'");f.sub.status='expired';return f;}
test('direct first Pro purchase charges 50, starts a full month after capture and never cancels another mandate',async()=>{const f=direct(setup());try{
 const q=await saveIntroQuote(f.db,'user1',f.target,'card');assert.equal(q.kind,'intro');assert.equal(q.quote.amountDueSubunits,5000);assert.equal(q.quote.unusedCreditSubunits,0);
 await acceptUpgrade(f.db,'user1',q.quoteId,f.deps);f.pay();const result=await verifyUpgradePayment(f.db,await ownedUpgrade(f.db,'user1',q.quoteId),'pay_upgrade',f.deps);assert.equal(result.accessGranted,true);assert.equal(result.kind,'intro');assert.equal(result.sourceCancelled,true);
 assert.equal(f.calls.some(c=>c.path.startsWith('subscriptions/')),false);const access=f.sql.prepare('SELECT * FROM user_subscriptions').get();assert.equal(access.starts_at,result.quote.effectiveAt);assert.equal(access.ends_at,result.quote.nextRenewalAt);
 assert.equal(await proOfferEligible(f.db,'user1'),false);await verifyUpgradePayment(f.db,await ownedUpgrade(f.db,'user1',q.quoteId),'pay_upgrade',f.deps);assert.equal(f.sql.prepare('SELECT ends_at FROM user_subscriptions').get().ends_at,access.ends_at);
 await assert.rejects(saveIntroQuote(f.db,'user1',f.target),{code:'upgrade_offer_used'});
 }finally{f.cleanup();}});
test('direct Pro offer refuses an existing mandate, lost-response checkout, or another accepted first-month payment',async()=>{const f=setup();try{
 await assert.rejects(saveIntroQuote(f.db,'user1',f.target),{code:'intro_existing_subscription'});direct(f);
 const q=await saveIntroQuote(f.db,'user1',f.target);await acceptUpgrade(f.db,'user1',q.quoteId,f.deps);await assert.rejects(saveIntroQuote(f.db,'user1',f.target),{code:'intro_existing_subscription'});
 assert.throws(()=>f.sql.prepare("INSERT INTO payment_checkout_attempts(id,request_key,user_id,fingerprint,input_json,state,created_at,updated_at) VALUES('other','otherkey','user1','x','{}','reserved',?,?)").run(new Date().toISOString(),new Date().toISOString()),/saved Pro payment/);
 }finally{f.cleanup();}});
test('direct payment which loses offer eligibility is refunded rather than granted',async()=>{const f=direct(setup());try{
 const q=await saveIntroQuote(f.db,'user1',f.target);await acceptUpgrade(f.db,'user1',q.quoteId,f.deps);f.pay();f.sql.exec("INSERT INTO subscription_purchase_groups(id,user_id,plan_id,policy_snapshot_json,quoted_amount_subunits,currency,winning_payment_id,state) VALUES('prior','user1','pro','{}',5000,'INR','pay_prior','paid')");
 const view=await verifyUpgradePayment(f.db,await ownedUpgrade(f.db,'user1',q.quoteId),'pay_upgrade',f.deps);assert.equal(view.accessGranted,false);assert.equal(view.state,'review');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM user_subscriptions').get().n,0);assert.equal(f.sql.prepare('SELECT state FROM subscription_refund_obligations').get().state,'pending');
 await maintainUpgradeRefunds(f.db,f.deps);assert.equal(f.sql.prepare('SELECT state FROM subscription_refund_obligations').get().state,'processed');
 }finally{f.cleanup();}});

test('direct-intro migration preserves an existing saved upgrade and its verified-payment attribution',async()=>{const f=setup(false);try{
 const q=await saveUpgradeQuote(f.db,'user1',f.target),receipt=`up_${q.quoteId.replaceAll('-','')}`;
 f.sql.prepare("INSERT INTO subscription_upgrades(purchase_group_id,user_id,source_subscription_id,source_invoice_id,state,provider_order_id,receipt,replacement_request_id,updated_at) VALUES(?,'user1','sub_1','inv_1','ready','order_upgrade',?,'previous-renewal-key',?)").run(q.quoteId,receipt,new Date().toISOString());
 const before=f.sql.prepare('SELECT * FROM subscription_upgrades').get();f.sql.exec(readFileSync('d1/migrations/0077_direct_pro_intro.sql','utf8'));const after=f.sql.prepare('SELECT * FROM subscription_upgrades').get();for(const [key,value] of Object.entries(before))assert.equal(after[key],value);assert.equal(after.kind,'upgrade');assert.equal(after.access_ends_at,null);assert.equal(f.sql.prepare('PRAGMA foreign_key_check').all().length,0);
 f.orders.set('order_upgrade',{id:'order_upgrade',receipt,amount:q.quote.amountDueSubunits,currency:'INR',partial_payment:false,notes:{ca_progress_user_id:'user1',ca_progress_purchase_group_id:q.quoteId,ca_progress_policy_version_id:'pvpro'}});f.pay();const result=await verifyUpgradePayment(f.db,await ownedUpgrade(f.db,'user1',q.quoteId),'pay_upgrade',f.deps);assert.equal(result.accessGranted,true);assert.equal(result.quote.nextRenewalAt,q.quote.nextRenewalAt);
 }finally{f.cleanup();}});

test('legacy paid Pro orders consume the direct first-month offer even without a subscription payment link',async()=>{const f=direct(setup());try{f.sql.exec("INSERT INTO payment_orders(id,provider_order_id,user_id,plan_id,status,provider_payment_id) VALUES('legacypro','order_legacypro','user1','pro','paid',NULL)");assert.equal(await proOfferEligible(f.db,'user1'),false);await assert.rejects(saveIntroQuote(f.db,'user1',f.target),{code:'upgrade_offer_used'});}finally{f.cleanup();}});

test('Basic and Pro first-month eligibility is independent, while unpaid admin grants do not consume either',async()=>{const f=setup();try{
 assert.equal(await tierOfferEligible(f.db,'user1','basic'),false);assert.equal(await tierOfferEligible(f.db,'user1','pro'),true);
 f.sql.exec("INSERT INTO app_users VALUES('user2');INSERT INTO user_subscriptions(id,user_id,plan_id,status,starts_at,ends_at,source) VALUES('grant','user2','basic','active','2026-01-01','2099-01-01','admin')");
 const target={planId:'basic',policyVersionId:'pv1',recurringPriceSubunits:5000,currency:'INR'},q=await saveIntroQuote(f.db,'user2',target,'emandate');assert.equal(q.quote.amountDueSubunits,2500);assert.equal(q.quote.recurringPriceSubunits,5000);assert.equal(await tierOfferEligible(f.db,'user2','basic'),true);
 f.sql.exec("INSERT INTO payment_orders(id,provider_order_id,user_id,plan_id,status) VALUES('oldbasic','order_oldbasic','user2','basic','paid')");await assert.rejects(acceptUpgrade(f.db,'user2',q.quoteId,f.deps),{code:'upgrade_offer_used'});assert.equal(await tierOfferEligible(f.db,'user2','pro'),true);
 }finally{f.cleanup();}});
