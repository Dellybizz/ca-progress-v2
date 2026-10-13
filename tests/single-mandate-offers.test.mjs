import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/payment-worker-fixture.mjs';
import {singleMandateTerms,mandateOfferMatches} from '../lib/billing/single-mandate-offers.mjs';
import {verifyCycle,expectedCycleAmount} from '../lib/billing/renewal-engine.mjs';
import {createCheckout,checkoutInput} from '../lib/billing/checkout-engine.mjs';
const terms={planId:'basic',policyVersionId:'pv1',recurringPrice:5000,currency:'INR',tierKey:'basic',billingCycle:'monthly',introPrice:null,introCycles:0,introProviderOfferId:null,introOfferVerified:false};
for(const method of ['upi','card'])test(`one ${method} mandate has discounted first cycle and regular second cycle`,async()=>{const f=fixture({fetch(){}});try{
 f.sql.exec("UPDATE razorpay_subscriptions SET status='cancelled';INSERT INTO subscription_mandate_offers VALUES('basic','"+method+"','pv1','offer_First',2500,5000,'INR','dashboard proof','admin','2026-10-01',0)");
 const chosen=await singleMandateTerms(f.db,'user1',terms,method);assert.equal(chosen.introPrice,2500);assert.equal(chosen.introCycles,1);assert.equal(chosen.introProviderOfferId,'offer_First');
 const contract={provider_subscription_id:'sub_Same',recurring_price_subunits:5000,initial_price_subunits:2500,intro_billing_cycles:1,provider_offer_id:'offer_First',checkout_payment_method:method,currency:'INR'};
 for(const cycle of [1,2]){const amount=cycle===1?2500:5000;assert.equal(expectedCycleAmount(contract,cycle),amount);const invoice={id:`inv_${cycle}`,subscription_id:'sub_Same',payment_id:`pay_${cycle}`,cycleNumber:cycle,status:'paid',amount:5000,amount_paid:amount,amount_due:0,currency:'INR'},payment={id:`pay_${cycle}`,subscription_id:'sub_Same',invoice_id:invoice.id,method,status:'captured',amount,currency:'INR'};if(cycle===2)invoice.amount=amount;assert.equal(verifyCycle(contract,invoice,payment).status,'verified');assert.throws(()=>verifyCycle(contract,invoice,{...payment,method:'emandate'}),{code:'renewal_method_mismatch'});}
 f.sql.exec("INSERT INTO payment_orders VALUES('paid','order_Paid','user1','basic','paid','pay_Paid');INSERT INTO payment_order_offer_snapshots VALUES('paid',1,2500,5000)");assert.equal(await singleMandateTerms(f.db,'user1',terms,method),null);
 }finally{f.cleanup();}});
test('missing, unsupported or stale bindings cannot promise a one-mandate discount',async()=>{const f=fixture({fetch(){}});try{
 assert.equal(await singleMandateTerms(f.db,'user1',terms,'upi'),null);assert.equal(await singleMandateTerms(f.db,'user1',terms,'emandate'),null);
 const binding={payment_method:'card',plan_id:'basic',policy_version_id:'pv1',provider_offer_id:'offer_First',verified_at:'2026-10-01',currency:'INR',intro_price_subunits:2500,recurring_price_subunits:5000};assert.equal(mandateOfferMatches(binding,terms,2500,'card'),true);
 for(const patch of [{policy_version_id:'old'},{recurring_price_subunits:6000},{intro_price_subunits:2000},{verified_at:null},{currency:'USD'},{payment_method:'upi'}])assert.equal(mandateOfferMatches({...binding,...patch},terms,2500,'card'),false);
 }finally{f.cleanup();}});
test('single-mandate intent survives input validation without changing legacy checkouts',()=>{const input={requestId:'request_1234567890',planId:'basic',paymentMethod:'upi'};assert.equal(checkoutInput({...input,singleMandate:true}).singleMandate,true);assert.equal('singleMandate' in checkoutInput(input),false);});

for(const method of ['upi','card'])test(`checkout creates exactly one ${method} subscription with offer on the regular plan and never creates an order`,async()=>{const f=fixture({fetch(){}});try{
 f.sql.exec("UPDATE razorpay_subscriptions SET status='cancelled';INSERT INTO subscription_mandate_offers VALUES('basic','"+method+"','pv1','offer_First',2500,5000,'INR','dashboard proof','admin','2026-10-01',0)");
 let posts=0;const deps={keyId:'rzp_test_fixture',async prepare(input){const selected=await singleMandateTerms(f.db,'user1',terms,input.paymentMethod);assert.ok(selected);const contract={...selected,paymentMethod:input.paymentMethod,providerPlanId:'plan_1',initialAmount:selected.introPrice,durationValue:1,durationUnit:'month',trialDays:0,graceDays:3,cancellationMode:'period_end',totalCount:12,providerOfferId:selected.introProviderOfferId,mandateScheduleVersion:'p3-one-year-v1'};return {contract,payload:{plan_id:'plan_1',offer_id:selected.introProviderOfferId,total_count:12,quantity:1,customer_notify:true,notes:{checkout_key:input.requestId,ca_progress_user_id:'user1',ca_progress_policy_version_id:'pv1'}}};},async provider(path,init){assert.equal(path,'subscriptions');assert.equal(init.method,'POST');posts++;return {...JSON.parse(init.body),id:'sub_New',status:'created',paid_count:0,remaining_count:12};}};
 const input={requestId:'single_mandate_request_001',planId:'basic',policyVersionId:'pv1',paymentMethod:method,promoCode:'',singleMandate:true};
 const view=await createCheckout(f.db,'user1',input,deps);assert.equal(view.initialAmount,2500);assert.equal(view.recurringAmount,5000);assert.equal(view.subscriptionId,'sub_New');assert.equal(view.accessGranted,false);assert.equal(posts,1);
 const row=f.sql.prepare("SELECT * FROM payment_checkout_attempts WHERE request_key=?").get(input.requestId);assert.equal(JSON.parse(row.payload_json).offer_id,'offer_First');assert.equal(JSON.parse(row.payload_json).start_at,undefined);assert.equal(f.sql.prepare("SELECT provider_offer_id FROM razorpay_subscriptions WHERE provider_subscription_id='sub_New'").get().provider_offer_id,'offer_First');
 }finally{f.cleanup();}});
