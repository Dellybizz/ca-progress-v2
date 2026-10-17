import {priceDecreaseStatements} from '../lib/billing/commercial-transitions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/payment-worker-fixture.mjs';
import {tierOfferEligible} from '../lib/billing/upgrade-engine.mjs';
import {publicCheckout} from '../lib/billing/checkout-engine.mjs';
import {mandateSchedule,supportedMandate} from '../lib/billing/mandate-schedule.mjs';
test('verified discounted cycle permanently consumes both plans; replay and refunds are idempotent',async()=>{
 const f=fixture({fetch(){}});try{
  const now=new Date().toISOString();
  f.sql.prepare("INSERT INTO payment_subscription_cycles VALUES('inv_1','local1','sub_1',1,'pay_1',?,?,2500,2500,'INR','verified','upi','test',?,?)").run(now,new Date(Date.now()+86400000).toISOString(),now,now);
  assert.equal(await tierOfferEligible(f.db,'user1','basic'),false);
  assert.equal(await tierOfferEligible(f.db,'user1','pro'),false);
  f.sql.exec("UPDATE payment_subscription_cycles SET status='refunded',verified_at=NULL;UPDATE payment_subscription_cycles SET updated_at='2099-01-01'");
  assert.equal(await tierOfferEligible(f.db,'user1','pro'),false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM student_introductory_consumptions').get().n,1);
 }finally{f.cleanup();}
});
test('captured regular-price fallback preserves offer eligibility despite a discounted checkout snapshot',async()=>{
 const f=fixture({fetch(){}});try{
  const now=new Date().toISOString();
  f.sql.prepare("INSERT INTO payment_subscription_cycles VALUES('inv_1','local1','sub_1',1,'pay_1',?,?,5000,5000,'INR','verified','upi','test',?,?)").run(now,new Date(Date.now()+86400000).toISOString(),now,now);
  assert.equal(await tierOfferEligible(f.db,'user1','basic'),true);
  assert.equal(await tierOfferEligible(f.db,'user1','pro'),true);
 }finally{f.cleanup();}
});
test('quote expiry blocks only unpaid setup resume, not authenticated in-flight reconciliation',async()=>{
 const f=fixture({fetch(){}});try{
  const row={id:'attempt',user_id:'user1',state:'ready',provider_subscription_id:'sub_1',created_at:new Date(Date.now()-31*60000).toISOString(),input_json:JSON.stringify({planId:'basic',paymentMethod:'upi'}),contract_json:'{}'};
  let view=await publicCheckout(f.db,row,'test');assert.equal(view.quoteExpired,true);assert.equal(view.resumable,false);assert.equal(view.errorCode,'checkout_quote_expired');
  f.sql.exec("UPDATE razorpay_subscriptions SET status='authenticated'");
  view=await publicCheckout(f.db,row,'test');assert.equal(view.quoteExpired,false);assert.equal(view.resumable,true);
 }finally{f.cleanup();}
});
test('long-running mandates require the new saved contract version; old limits cannot silently expand',()=>{
 const schedule=mandateSchedule({billingCycle:'annual'});
 const local={total_count:100,billing_duration_value:1,billing_duration_unit:'year',mandate_schedule_version:schedule.scheduleVersion};
 assert.equal(supportedMandate(local),true);
 assert.equal(supportedMandate({...local,mandate_schedule_version:'p3-one-year-v1'}),false);
 assert.equal(supportedMandate(local,101),false);
 assert.equal(supportedMandate({...local,total_count:0},0),false);
});
test('annual seed migration preserves purchased policies and produces editable prices without auto-publication',()=>{
 const sql=new DatabaseSync(':memory:');try{
  sql.exec(`CREATE TABLE subscription_plans(id TEXT PRIMARY KEY,tier_key TEXT,billing_cycle TEXT,name TEXT,tagline TEXT,rank INTEGER,price_subunits INTEGER,currency TEXT,duration_value INTEGER,duration_unit TEXT,active INTEGER,checkout_enabled INTEGER,sort_order INTEGER,UNIQUE(tier_key,billing_cycle));
  CREATE TABLE plan_policy_versions(id TEXT PRIMARY KEY,plan_id TEXT,version INTEGER,state TEXT,name TEXT,description TEXT,price_subunits INTEGER,currency TEXT,billing_duration_value INTEGER,billing_duration_unit TEXT,trial_days INTEGER,grace_days INTEGER,change_reason TEXT,effective_at TEXT,published_at TEXT,created_at TEXT);
  CREATE TABLE plan_policy_offer_terms(policy_version_id TEXT PRIMARY KEY,intro_price_subunits INTEGER,intro_billing_cycles INTEGER,cancellation_mode TEXT,terms_note TEXT);
  CREATE TABLE plan_policy_pages(policy_version_id TEXT,page_key TEXT,enabled INTEGER,PRIMARY KEY(policy_version_id,page_key));
  CREATE TABLE plan_policy_features(policy_version_id TEXT,page_key TEXT,feature_key TEXT,enabled INTEGER,quantity_limit INTEGER,time_limit_minutes INTEGER,storage_limit_bytes INTEGER,file_size_limit_bytes INTEGER,reset_period TEXT,retention_days INTEGER,upgrade_message TEXT,dependencies_json TEXT,PRIMARY KEY(policy_version_id,feature_key));
  CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT);
  INSERT INTO subscription_plans VALUES('custom-annual','basic','annual','Custom Striver','kept',1,75000,'INR',1,'year',1,1,10);
  INSERT INTO plan_policy_versions(id,plan_id,version,state,name,price_subunits) VALUES('purchased','custom-annual',1,'published','Custom Striver',75000);`);
  const migration=readFileSync('d1/migrations/0086_annual_autopay_drafts.sql','utf8');sql.exec(migration);sql.exec(migration);
  assert.deepEqual({...sql.prepare("SELECT price_subunits,state FROM plan_policy_versions WHERE id='purchased'").get()},{price_subunits:75000,state:'published'});
  const drafts=sql.prepare("SELECT price_subunits,state,grace_days FROM plan_policy_versions WHERE id LIKE 'owner-20261013-%' ORDER BY price_subunits").all();
  assert.deepEqual(drafts.map(r=>[r.price_subunits,r.state,r.grace_days]),[[50000,'draft',10],[125000,'draft',10]]);
  sql.exec("UPDATE plan_policy_offer_terms SET intro_price_subunits=10000,intro_billing_cycles=1 WHERE policy_version_id='owner-20261013-pro-annual'");
  assert.throws(()=>sql.exec("UPDATE plan_policy_versions SET state='published' WHERE id='owner-20261013-pro-annual'"),/Annual introductory discounts/);
 }finally{sql.close();}
});

test('publication schedules only actual price decreases at paid expiry, with ten-day approval grace',async()=>{
 const f=fixture({fetch(){}});try{
  const end=new Date(Date.now()+86400000).toISOString(),now=new Date().toISOString();
  f.sql.prepare("UPDATE razorpay_subscriptions SET status='active',financial_state='paid',paid_count=1,paid_through_at=?").run(end);
  f.sql.exec("INSERT INTO plan_policy_versions VALUES('lower','basic');INSERT INTO plan_policy_versions VALUES('higher','basic')");
  const input={planId:'basic',policyId:'lower',priceSubunits:4000,actorId:'user1',reason:'Lower published pricing',now};
  await f.db.batch(priceDecreaseStatements(f.db,input));await f.db.batch(priceDecreaseStatements(f.db,input));
  const job=f.sql.prepare('SELECT * FROM subscription_policy_change_jobs').get();
  assert.equal(job.effective_at,end);assert.equal(job.approval_grace_days,10);assert.equal(job.target_price_subunits,4000);assert.equal(job.state,'pending');
  assert.equal(f.sql.prepare('SELECT recurring_price_subunits FROM razorpay_subscriptions').get().recurring_price_subunits,5000);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM subscription_policy_change_jobs').get().n,1);
  await f.db.batch(priceDecreaseStatements(f.db,{...input,policyId:'higher',priceSubunits:6000}));
  assert.equal(f.sql.prepare('SELECT state FROM subscription_policy_change_jobs').get().state,'superseded');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM subscription_policy_change_jobs').get().n,1);
 }finally{f.cleanup();}
});
