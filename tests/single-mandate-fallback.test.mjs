import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCycle,collectRenewalEvidence} from '../lib/billing/renewal-engine.mjs';
import {checkoutInput} from '../lib/billing/checkout-engine.mjs';
import {checkoutIntent} from '../lib/billing/checkout-client.mjs';
import {fixture} from './helpers/payment-worker-fixture.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

function evidence(first,regular){
 const c={allowRegularPriceFallback:true,regularPriceFallbackAccepted:true,providerOfferId:'offer_1',initialAmount:first,recurringPrice:regular,paymentMethod:'upi'};
 const attempt={provider_subscription_id:'sub_1',user_id:'user1',request_key:'checkout_request_001',contract_json:JSON.stringify(c),input_json:JSON.stringify({singleMandate:true,acceptRegularPriceFallback:true})};
 const contract={provider_subscription_id:'sub_1',user_id:'user1',checkout_key:attempt.request_key,provider_offer_id:'offer_1',initial_price_subunits:first,recurring_price_subunits:regular,intro_billing_cycles:1,checkout_payment_method:'upi',currency:'INR',offer_creation_attempt:attempt};
 const invoice={id:'inv_1',subscription_id:'sub_1',payment_id:'pay_1',cycleNumber:1,status:'paid',amount:regular,amount_paid:regular,amount_due:0,currency:'INR'};
 const payment={id:'pay_1',subscription_id:'sub_1',invoice_id:'inv_1',status:'captured',method:'upi',amount:regular,currency:'INR'};
 return {c,attempt,contract,invoice,payment};
}
for(const [plan,first,regular] of [['Basic',2500,5000],['Pro',5000,15000]])test(`${plan} fallback accepts only exact captured full price with immutable customer consent`,()=>{
 const e=evidence(first,regular);
 assert.deepEqual(verifyCycle(e.contract,e.invoice,e.payment),{expected:regular,status:'verified'});
 assert.equal(verifyCycle(e.contract,{...e.invoice,amount_paid:first},{...e.payment,amount:first}).expected,first);
 for(const patch of [{amount:regular+100},{amount:first+100},{currency:'USD'},{method:'card'},{invoice_id:'inv_Other'},{status:'authorized'}])assert.throws(()=>verifyCycle(e.contract,e.invoice,{...e.payment,...patch}));
 assert.throws(()=>verifyCycle({...e.contract,offer_creation_attempt:null},e.invoice,e.payment),{code:'renewal_amount_mismatch'});
 for(const patch of [{input_json:'{}'},{user_id:'someone-else'},{provider_subscription_id:'sub_Other'},{request_key:'other'},{contract_json:JSON.stringify({...e.c,regularPriceFallbackAccepted:false})},{contract_json:JSON.stringify({...e.c,providerOfferId:'offer_Other'})}])assert.throws(()=>verifyCycle({...e.contract,offer_creation_attempt:{...e.attempt,...patch}},e.invoice,e.payment),{code:'renewal_amount_mismatch'});
 assert.equal(verifyCycle(e.contract,e.invoice,{...e.payment,amount_refunded:regular}).status,'refunded');
 assert.throws(()=>verifyCycle(e.contract,{...e.invoice,cycleNumber:2,amount:first,amount_paid:first},{...e.payment,amount:first}),{code:'renewal_amount_mismatch'});
});

test('a pending introductory invoice can settle at consented regular price and replay preserves the verified price',async()=>{
 const f=fixture({fetch(){}});try{
 const e=evidence(2500,5000),local=f.sql.prepare('SELECT * FROM razorpay_subscriptions').get();
 const contract={...local,offer_creation_attempt:e.attempt};
 f.invoices[0].status='issued';f.sub.paid_count=0;
 const provider=async path=>path.startsWith('invoices?')?{items:f.invoices}:f.payments.get(path.slice('payments/'.length));
 await collectRenewalEvidence(f.db,contract,f.sub,provider);
 f.invoices[0].status='paid';f.invoices[0].amount=5000;f.invoices[0].amount_paid=5000;f.sub.paid_count=1;f.payments.get('pay_1').amount=5000;
 for(let i=0;i<2;i++){const result=await collectRenewalEvidence(f.db,contract,f.sub,provider);assert.equal(result.firstCycleVerified,true);}
 const saved=f.sql.prepare('SELECT * FROM payment_subscription_cycles').get();assert.equal(saved.expected_amount_subunits,5000);assert.equal(saved.amount_subunits,5000);assert.equal(saved.status,'verified');
 f.payments.get('pay_1').amount=2500;f.invoices[0].amount_paid=2500;
 await assert.rejects(()=>collectRenewalEvidence(f.db,contract,f.sub,provider),{code:'renewal_invoice_mismatch'});
 }finally{f.cleanup();}
});

test('fallback acceptance survives validation and cannot silently reuse an unconsented checkout',()=>{
 const input={requestId:'checkout_request_001',planId:'basic',paymentMethod:'upi',singleMandate:true,acceptRegularPriceFallback:true};assert.equal(checkoutInput(input).acceptRegularPriceFallback,true);assert.equal(checkoutInput({...input,acceptRegularPriceFallback:'true'}).acceptRegularPriceFallback,undefined);
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 checkoutIntent(storage,'user1',{...input,acceptRegularPriceFallback:false},()=>input.requestId);
 const replacement=checkoutIntent(storage,'user1',input,()=> 'checkout_request_00002');assert.equal(replacement.acceptRegularPriceFallback,true);assert.notEqual(replacement.requestId,input.requestId);
});

test('live Pro binding targets current matching policy and updates Basic fallback without touching paid contracts',()=>{
 for(const price of [15000,16000]){
 const sql=new DatabaseSync(':memory:');try{
 sql.exec(`CREATE TABLE subscription_plans(id TEXT PRIMARY KEY,tier_key TEXT,billing_cycle TEXT,active INTEGER,checkout_enabled INTEGER);
 CREATE TABLE plan_policy_versions(id TEXT PRIMARY KEY,plan_id TEXT,price_subunits INTEGER,currency TEXT,trial_days INTEGER,billing_duration_value INTEGER,billing_duration_unit TEXT,state TEXT,effective_at TEXT,published_at TEXT,created_at TEXT,version INTEGER);
 CREATE TABLE subscription_upgrade_offers(plan_id TEXT,intro_price_subunits INTEGER,currency TEXT,state TEXT);
 CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT);
 INSERT INTO subscription_plans VALUES('pro','pro','monthly',1,1);
 INSERT INTO subscription_plans VALUES('basic','basic','monthly',1,1);
 INSERT INTO plan_policy_versions VALUES('basic-policy','basic',5000,'INR',0,1,'month','published',NULL,'2026-01-01','2026-01-01',1);
 INSERT INTO subscription_upgrade_offers VALUES('pro',5000,'INR','published');
 INSERT INTO plan_policy_versions VALUES('old','pro',15000,'INR',0,1,'month','published',NULL,'2025-01-01','2025-01-01',1);
 INSERT INTO plan_policy_versions VALUES('current','pro',${price},'INR',0,1,'month','published',NULL,'2026-01-01','2026-01-01',2);`);
 sql.exec(readFileSync('d1/migrations/0079_single_mandate_offers.sql','utf8'));
 sql.exec("INSERT INTO subscription_mandate_offers VALUES('basic','upi','basic-policy','offer_TmiyM56nUFR5PJ',2500,5000,'INR','proof','operator','2026-10-12')");
 const migration=readFileSync('d1/migrations/0081_pro_live_single_mandate_fallback.sql','utf8');
 if(price===16000){assert.throws(()=>sql.exec(migration),/CHECK constraint/);assert.equal(sql.prepare("SELECT COUNT(*) n FROM subscription_mandate_offers WHERE plan_id='pro'").get().n,0);assert.equal(sql.prepare("SELECT allow_regular_price_fallback FROM subscription_mandate_offers WHERE plan_id='basic'").get().allow_regular_price_fallback,0);}
 else{sql.exec(migration);const pro=sql.prepare("SELECT * FROM subscription_mandate_offers WHERE plan_id='pro'").get();assert.equal(pro.policy_version_id,'current');assert.equal(pro.provider_offer_id,'offer_Tmm4dnEyOmuBaO');assert.equal(pro.intro_price_subunits,5000);assert.equal(pro.recurring_price_subunits,15000);assert.equal(pro.allow_regular_price_fallback,1);assert.equal(sql.prepare("SELECT allow_regular_price_fallback FROM subscription_mandate_offers WHERE plan_id='basic'").get().allow_regular_price_fallback,1);}
 }finally{sql.close();}
 }
});
