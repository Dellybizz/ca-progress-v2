import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('read-only pricing overlaps the safety gate and reuses reads within the request',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'checkout-overlap-'));
 const fixtures={
  './payment-p1':'export default {fetch(){},queue(){},scheduled(){}}',
  './p3':'export const resolveCommercial=(db,plan,user)=>globalThis.__checkoutOverlap.read(plan,user); export const ensurePlan=async()=>({providerPlanId:"plan_1"});export const requireIntroOffer=()=>null;',
  '../../lib/billing/prepaid-access.mjs':'export const prepaidAccess=()=>globalThis.__checkoutOverlap.paid();',
  './p4-closure':'export const safeAuthorizationUrl=()=>null;export const freezeUnsafeSubscriptionCreation=()=>globalThis.__checkoutOverlap.gate();',
  './p4-final':'export const reserveCampaign=async()=>null;',
 };
 try{
  await build({entryPoints:['workers/billing/payment-p2.ts'],outfile:join(dir,'worker.mjs'),bundle:true,format:'esm',platform:'node',plugins:[{name:'checkout-fixtures',setup(b){
   b.onResolve({filter:/.*/},args=>fixtures[args.path]?{path:args.path,namespace:'fixture'}:undefined);
   b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path],loader:'js'}));
  }}]});
  const {dependencies}=await import(pathToFileURL(join(dir,'worker.mjs')));
  let finishGate;const calls=[];
  globalThis.__checkoutOverlap={read:async(plan,user)=>{calls.push(['read',plan,user]);return {planId:plan,policyVersionId:'pv1',recurringPrice:5000,introPrice:null,introCycles:0,currency:'INR',durationValue:1,durationUnit:'month',billingCycle:'monthly',trialDays:0};},paid:async()=>{calls.push(['paid']);return null;},gate:()=>{calls.push(['gate']);return new Promise(resolve=>{finishGate=resolve;});}};
  const deps=dependencies({DB:{}},'user1'),input={planId:'basic',paymentMethod:'card',policyVersionId:'pv1',requestId:'checkout_request_00001'};
  const gate=deps.preflight(input);
  assert.deepEqual(calls,[['read','basic','user1'],['paid'],['gate']]);
  finishGate(null);await gate;
  const result=await deps.prepare(input,'user1');
  assert.equal(result.payload.plan_id,'plan_1');
  assert.equal(calls.filter(([name])=>name==='read').length,1,'reuse request-local reads');
  assert.equal(calls.filter(([name])=>name==='paid').length,1);
 }finally{delete globalThis.__checkoutOverlap;await rm(dir,{recursive:true,force:true});}
});
