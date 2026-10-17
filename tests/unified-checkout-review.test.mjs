import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewCheckoutSelection} from '../lib/billing/pricing-state.mjs';
const offer={billingCycle:'monthly',recurringPriceSubunits:15000,introPriceSubunits:5000,introEligible:true,upgradeIntroPriceSubunits:5000,singleMandateMethods:['upi'],singleMandateFallbackMethods:['upi'],trialDays:0};
test('reopening review preserves method-specific prices and approved fallback',()=>{
 for(let opening=0;opening<3;opening++){
  const upi=reviewCheckoutSelection(offer,'upi');
  assert.equal(upi.quote.dueTodaySubunits,5000);assert.equal(upi.singleMandate,true);assert.equal(upi.acceptRegularPriceFallback,true);
  for(const method of ['card','emandate']){const selected=reviewCheckoutSelection(offer,method);assert.equal(selected.quote.dueTodaySubunits,15000);assert.equal(selected.singleMandate,false);assert.equal(selected.acceptRegularPriceFallback,false);}
 }
});
test('annual, consumed offers and plan changes retain correct discount restrictions',()=>{
 assert.equal(reviewCheckoutSelection({...offer,introEligible:false,upgradeIntroPriceSubunits:undefined,singleMandateMethods:[]},'upi').quote.dueTodaySubunits,15000);
 for(const context of [{downgrade:true},{priceApproval:true}]){const selected=reviewCheckoutSelection(offer,'upi',context);assert.equal(selected.singleMandate,false);assert.equal(selected.quote.introApplied,false);}
 const annual=reviewCheckoutSelection({...offer,billingCycle:'annual',recurringPriceSubunits:125000,introPriceSubunits:null,introEligible:false,upgradeIntroPriceSubunits:undefined},'upi');assert.equal(annual.quote.dueTodaySubunits,125000);assert.equal(annual.singleMandate,false);
});
test('pricing uses one review for selection and retry without preparing a mandate on open',()=>{
 const source=readFileSync('components/billing/pricing-client.tsx','utf8');
 assert.doesNotMatch(source,/SingleMandateReview|UpgradeCheckout|setSinglePlan|warmPurchase/);
 assert.equal((source.match(/<dialog\b/g)??[]).length,1);
 assert.match(source,/purchase\(plan,method,selection.singleMandate,selection.acceptRegularPriceFallback\)/);
 assert.match(source,/setMethod\(view.paymentMethod\);setCompletionPhase\('idle'\);setReviewPlan\(plan\)/);
});
