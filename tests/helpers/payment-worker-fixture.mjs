import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function fixture(worker){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE app_users(user_id TEXT PRIMARY KEY);INSERT INTO app_users VALUES('user1');CREATE TABLE subscription_plans(id TEXT PRIMARY KEY);INSERT INTO subscription_plans VALUES('basic');CREATE TABLE plan_policy_versions(id TEXT PRIMARY KEY,plan_id TEXT);INSERT INTO plan_policy_versions VALUES('pv1','basic');CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT);
 CREATE TABLE user_subscriptions(id TEXT PRIMARY KEY,user_id TEXT,plan_id TEXT,status TEXT,starts_at TEXT,ends_at TEXT,source TEXT,source_order_id TEXT,source_payment_id TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE payment_orders(id TEXT PRIMARY KEY,provider_order_id TEXT,user_id TEXT,plan_id TEXT,status TEXT,provider_payment_id TEXT);CREATE TABLE payment_events(id TEXT PRIMARY KEY,payment_order_id TEXT,verified INTEGER);
 CREATE TABLE scheduled_plan_changes(id TEXT PRIMARY KEY,user_id TEXT,to_plan_id TEXT,state TEXT,effective_at TEXT,applied_at TEXT);
 CREATE TABLE subscription_policy_contracts(subscription_id TEXT PRIMARY KEY,policy_version_id TEXT,grandfathered INTEGER,decision_reason TEXT);
 CREATE TABLE subscription_events(id TEXT PRIMARY KEY,subscription_id TEXT,user_id TEXT,plan_id TEXT,payment_event_id TEXT,event_type TEXT,source TEXT,starts_at TEXT,ends_at TEXT,metadata TEXT,created_at TEXT);`);
 sql.exec(readFileSync('d1/migrations/0051_refinement_phase3_razorpay_subscriptions.sql','utf8'));
 sql.exec('ALTER TABLE razorpay_subscriptions ADD COLUMN provider_offer_id TEXT;ALTER TABLE razorpay_subscriptions ADD COLUMN campaign_claim_id TEXT;');
 sql.exec(readFileSync('d1/migrations/0070_payment_system_p2_checkout.sql','utf8'));
 sql.exec(readFileSync('d1/migrations/0071_payment_system_p3_renewals.sql','utf8'));
 sql.exec(readFileSync('d1/migrations/0010_phase12_background_jobs.sql','utf8'));
 sql.exec(readFileSync('d1/migrations/0072_payment_system_p4_convergence.sql','utf8'));
 sql.exec('CREATE TABLE billing_campaign_claims(id TEXT PRIMARY KEY,provider_offer_id TEXT,discount_cycles INTEGER,campaign_version_id TEXT);CREATE TABLE billing_campaign_versions(id TEXT PRIMARY KEY,discount_kind TEXT,discount_value INTEGER,discount_cycles INTEGER);')
 sql.exec(`INSERT INTO razorpay_plan_mappings(id,policy_version_id,internal_plan_id,price_kind,provider_plan_id,period,interval_value,amount_subunits,currency,state) VALUES('mapping1','pv1','basic','recurring','plan_1','monthly',1,5000,'INR','ready');
 INSERT INTO razorpay_subscriptions(id,checkout_key,user_id,plan_id,policy_version_id,provider_subscription_id,provider_plan_id,recurring_provider_plan_id,status,recurring_price_subunits,initial_price_subunits,currency,billing_cycle,billing_duration_value,billing_duration_unit,intro_billing_cycles,intro_remaining_cycles,cancellation_mode,total_count,provider_offer_id,checkout_payment_method) VALUES('local1','checkout_request_001','user1','basic','pv1','sub_1','plan_1','plan_1','created',5000,2500,'INR','monthly',1,'month',1,1,'period_end',12,'offer_1','upi');`);
 const db={prepare(query){return {values:[],bind(...values){this.values=values;return this;},async first(){return sql.prepare(query).get(...this.values)??null;},async all(){return {results:sql.prepare(query).all(...this.values)};},async run(){return {success:true,meta:{changes:Number(sql.prepare(query).run(...this.values).changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const now=Math.floor(Date.now()/1000),start=now-3600,end=now+86400;
 const sub={id:'sub_1',plan_id:'plan_1',offer_id:'offer_1',status:'active',paid_count:1,total_count:12,current_start:start,current_end:end,remaining_count:11};
 const invoices=[{id:'inv_1',subscription_id:'sub_1',payment_id:'pay_1',status:'paid',billing_start:start,billing_end:end,amount:2500,amount_paid:2500,amount_due:0,currency:'INR'}];
 const payments=new Map([['pay_1',{id:'pay_1',invoice_id:'inv_1',subscription_id:'sub_1',method:'upi',status:'captured',amount:2500,currency:'INR',created_at:start}]]),calls=[];
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),method:init.method??'GET'});const path=new URL(url).pathname;if(path==='/v1/subscriptions/sub_1')return Response.json(sub);if(path==='/v1/invoices')return Response.json({items:invoices});if(path.startsWith('/v1/payments/'))return Response.json(payments.get(path.slice('/v1/payments/'.length)));throw new Error('Unexpected provider request');};
 const env={DB:db,RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'fixture-secret',RAZORPAY_WEBHOOK_SECRET:'fixture-webhook'};
 const sync=()=>worker.fetch(new Request('https://billing.internal/subscription-action',{method:'POST',headers:{'x-ca-progress-internal':'ca-progress-v2-web','x-ca-progress-user-id':'user1','content-type':'application/json'},body:JSON.stringify({subscriptionId:'sub_1',action:'sync',requestId:crypto.randomUUID()})}),env);
 return {sql,db,sub,invoices,payments,env,sync,calls,cleanup(){globalThis.fetch=original;sql.close();}};
}
