import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {annualReferencePrice} from '../lib/billing/pricing-state.mjs';
import {quoteForMethod} from '../lib/billing/payment-quote.mjs';

test('annual comparison follows regular monthly admin pricing',()=>{
 assert.equal(annualReferencePrice(5000,50000),60000);
 assert.equal(annualReferencePrice(15000,125000),180000);
 assert.equal(annualReferencePrice(20000,125000),240000);
 for(const pair of [[0,50000],[5000,60000],[5000,65000],[NaN,50000]])assert.equal(annualReferencePrice(...pair),null);
});
test('Ranker repair restores only missing approved terms and is idempotent',()=>{
 const db=new DatabaseSync(':memory:');
 const policy='policy-0053-price-repair-d125a4ca-d670-4023-8863-dc172955f74a';
 try{
 db.exec(`CREATE TABLE subscription_plans(id TEXT,tier_key TEXT,billing_cycle TEXT);
 CREATE TABLE plan_policy_versions(id TEXT,plan_id TEXT,state TEXT,price_subunits INTEGER,currency TEXT,billing_duration_value INTEGER,billing_duration_unit TEXT,trial_days INTEGER,effective_at TEXT,published_at TEXT,created_at TEXT,version INTEGER);
 CREATE TABLE subscription_mandate_offers(policy_version_id TEXT,plan_id TEXT,payment_method TEXT,provider_offer_id TEXT,intro_price_subunits INTEGER,recurring_price_subunits INTEGER,currency TEXT,verified_at TEXT);
 CREATE TABLE plan_policy_offer_terms(policy_version_id TEXT,intro_price_subunits INTEGER,intro_billing_cycles INTEGER,provider_offer_id TEXT,provider_offer_verified_at TEXT,provider_offer_snapshot_json TEXT,updated_at TEXT);
 CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT);
 INSERT INTO subscription_plans VALUES('pro','pro','monthly');`);
 db.prepare("INSERT INTO plan_policy_versions VALUES(?,'pro','published',15000,'INR',1,'month',0,NULL,'2026-01-01','2026-01-01',1)").run(policy);
 db.prepare("INSERT INTO plan_policy_offer_terms VALUES(?,NULL,0,NULL,NULL,'{}',NULL)").run(policy);
 db.prepare("INSERT INTO subscription_mandate_offers VALUES(?,'pro','upi','offer_Tmm4dnEyOmuBaO',5000,15000,'INR','2026-10-12')").run(policy);
 const sql=readFileSync('d1/migrations/0092_ranker_first_month_offer.sql','utf8');
 db.exec("UPDATE subscription_mandate_offers SET recurring_price_subunits=16000");db.exec(sql);
 assert.equal(db.prepare('SELECT intro_price_subunits FROM plan_policy_offer_terms').get().intro_price_subunits,null);
 db.exec("UPDATE subscription_mandate_offers SET recurring_price_subunits=15000");db.exec(sql);
 const terms=db.prepare('SELECT * FROM plan_policy_offer_terms').get();
 assert.equal(terms.intro_price_subunits,5000);assert.equal(terms.intro_billing_cycles,1);assert.equal(terms.provider_offer_id,'offer_Tmm4dnEyOmuBaO');
 assert.equal(quoteForMethod({recurring:15000,intro:terms.intro_price_subunits,eligible:true},'upi').dueTodaySubunits,5000);
 assert.equal(quoteForMethod({recurring:15000,intro:5000,eligible:false},'upi').dueTodaySubunits,15000);
 assert.equal(quoteForMethod({recurring:15000,intro:5000,eligible:true},'card').dueTodaySubunits,15000);
 db.exec(sql);assert.deepEqual(db.prepare('SELECT * FROM plan_policy_offer_terms').get(),terms);
 db.exec('UPDATE plan_policy_offer_terms SET intro_price_subunits=7500');db.exec(sql);
 assert.equal(db.prepare('SELECT intro_price_subunits FROM plan_policy_offer_terms').get().intro_price_subunits,7500);
 }finally{db.close();}
});
