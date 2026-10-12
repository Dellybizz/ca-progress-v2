import test from 'node:test';
import assert from 'node:assert/strict';
import {hasEstablishedRecurring,checkoutRecoveryVisible} from '../lib/billing/pricing-state.mjs';
const setup={planId:'pro',status:'created',financialState:'unpaid',paidCount:0,trialDays:0};
test('unpaid, failed, and closed Pro setups never become an active renewal',()=>{
 for(const status of ['created','authenticated','cancelled','expired','pending'])assert.equal(hasEstablishedRecurring({...setup,status},'free'),false);
 assert.equal(hasEstablishedRecurring({...setup,status:'active'},'free'),false);
});
test('paid subscriptions and verified active trials retain renewal management',()=>{
 assert.equal(hasEstablishedRecurring({...setup,status:'active',financialState:'paid',paidCount:1},'pro'),true);
 assert.equal(hasEstablishedRecurring({...setup,status:'pending',paidCount:1},'pro'),true);
 assert.equal(hasEstablishedRecurring({...setup,status:'active',trialDays:7},'pro'),true);
 assert.equal(hasEstablishedRecurring({...setup,status:'active',trialDays:7},'free'),false);
 for(const financialState of ['mismatch','disputed','refunded'])assert.equal(hasEstablishedRecurring({...setup,status:'active',paidCount:1,financialState},'pro'),false);
});
test('unfinished unpaid checkout prompts stay hidden while uncertain payment verification stays visible',()=>{
 const view={state:'ready',providerStatus:'created',subscriptionId:'sub_1',resumable:true,accessGranted:false};
 assert.equal(checkoutRecoveryVisible(view),false);
 assert.equal(checkoutRecoveryVisible({...view,state:'pending',providerStatus:'authenticated'}),true);
 for(const state of ['failed','cancelled','succeeded'])assert.equal(checkoutRecoveryVisible({...view,state,resumable:false}),false);
 assert.equal(checkoutRecoveryVisible({...view,state:'uncertain',resumable:false}),true);
 assert.equal(checkoutRecoveryVisible({...view,state:'pending',resumable:false},'sub_1'),false);
 assert.equal(checkoutRecoveryVisible({...view,state:'pending',resumable:false,accessGranted:true}),false);
});

test('rendered Pricing keeps Free current and Pro purchasable when an unpaid Pro setup exists',async()=>{
 const {build}=await import('esbuild');
 const {mkdtemp,rm}=await import('node:fs/promises');
 const {join}=await import('node:path');
 const {pathToFileURL}=await import('node:url');
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const dir=await mkdtemp(join(process.cwd(),'.pricing-state-test-'));
 try{
  const output=join(dir,'pricing.mjs');
  await build({entryPoints:['components/billing/pricing-client.tsx'],outfile:output,bundle:true,format:'esm',platform:'node',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/jsx-runtime','react-dom'],plugins:[{name:'navigation-fixture',setup(builder){
   builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
   builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useRouter=()=>({push(){},refresh(){}});',loader:'js'}));
  }}]});
  const {PricingClient}=await import(pathToFileURL(output));
  const plans=['free','basic','pro'].map((tier_key,index)=>({id:tier_key,tier_key,billing_cycle:index?'monthly':'free',checkout_enabled:true,currency:'INR',price_subunits:index===2?15000:index===1?5000:0}));
  const offers=plans.slice(1).map(p=>({planId:p.id,checkoutReady:true,currency:'INR',recurringPriceSubunits:p.price_subunits,introEligible:false}));
  const html=renderToStaticMarkup(createElement(PricingClient,{plans,offers,entitlements:[],authenticated:true,viewerId:'user1',currentPlanId:'free',hasRecurring:true,subscription:{...setup,providerSubscriptionId:'sub_1'},commercePolicy:{webCheckoutAllowed:true}}));
  assert.match(html,/pricing-column--free[^]*?YOUR PLAN/);
  assert.match(html,/Choose Pro/);
  assert.doesNotMatch(html,/Change to Pro|Finish your payment|Your checkout is saved/);
  assert.match(html,/pricing-column--free[^]*?Current plan/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
