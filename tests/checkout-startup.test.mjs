import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {checkoutIntent,checkoutIntentForPurchase,readCheckoutIntent} from '../lib/billing/checkout-client.mjs';
const terms={planId:'basic',paymentMethod:'upi',policyVersionId:'pv1',promoCode:''};
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
test('fresh and resumed matching purchases never wait on a separate status lookup',async()=>{
 const s=storage();const read=()=>{throw new Error('extra network call');};
 const first=await checkoutIntentForPurchase(s,'user1',terms,()=> 'checkout_request_00001',read);
 const resumed=await checkoutIntentForPurchase(s,'user1',terms,()=> 'checkout_request_00002',read);
 assert.deepEqual(resumed,first);
});
test('changed terms replace only the same server-confirmed terminal intent',async()=>{
 const s=storage(),old=checkoutIntent(s,'user1',terms,()=> 'checkout_request_00001');
 const next=await checkoutIntentForPurchase(s,'user1',{...terms,planId:'pro'},()=> 'checkout_request_00002',async()=>({requestId:old.requestId,state:'cancelled'}));
 assert.equal(next.planId,'pro');assert.equal(next.requestId,'checkout_request_00002');
});
for(const status of [{requestId:'checkout_request_00001',state:'ready'},{requestId:'another_checkout_00001',state:'cancelled'},null])test(`unresolved or unrelated status preserves the saved intent: ${JSON.stringify(status)}`,async()=>{
 const s=storage(),old=checkoutIntent(s,'user1',terms,()=> 'checkout_request_00001');
 await assert.rejects(checkoutIntentForPurchase(s,'user1',{...terms,planId:'pro'},()=> 'checkout_request_00002',async()=>status));
 assert.deepEqual(readCheckoutIntent(s,'user1'),old);
});
const dir=await mkdtemp(join(tmpdir(),'checkout-startup-')),bundle=join(dir,'binding.mjs');
await build({entryPoints:['lib/billing/service-binding.ts'],outfile:bundle,bundle:true,format:'esm',platform:'neutral',plugins:[{name:'fixture-bindings',setup(build){
 build.onResolve({filter:/^(server-only|@opennextjs\/cloudflare|@\/lib\/cache\/public)$/},args=>({path:args.path,namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='server-only'?'':args.path==='@opennextjs/cloudflare'?'export const getCloudflareContext=()=>({env:{BILLING_SERVICE:globalThis.__checkoutService}});':'export const invalidateUserFeatureCache=async(user)=>globalThis.__checkoutInvalidations.push(user);',loader:'js'}));
}}]});
const {invokeBillingService}=await import(pathToFileURL(bundle));
after(async()=>{delete globalThis.__checkoutService;delete globalThis.__checkoutInvalidations;await rm(dir,{recursive:true,force:true});});
test('unpaid creation returns immediately without invalidating paid access, verified creation still invalidates',async()=>{
 globalThis.__checkoutInvalidations=[];
 globalThis.__checkoutService={fetch:async()=>Response.json({accessGranted:false,state:'ready'},{headers:{'server-timing':'checkout_provider;dur=123'}})};
 let response=await invokeBillingService({path:'/create-subscription',userId:'user1',body:'{}'});
 assert.equal(response.status,200);assert.match(response.headers.get('server-timing'),/checkout_provider;dur=123/);assert.match(response.headers.get('server-timing'),/billing;dur=/);assert.deepEqual(globalThis.__checkoutInvalidations,[]);
 globalThis.__checkoutService={fetch:async()=>Response.json({accessGranted:true,state:'succeeded'})};
 response=await invokeBillingService({path:'/create-subscription',userId:'user1',body:'{}'});
 assert.equal(response.status,200);assert.deepEqual(globalThis.__checkoutInvalidations,['user1']);
 globalThis.__checkoutInvalidations=[];
 await invokeBillingService({path:'/verify-subscription',userId:'user1',body:'{}'});
 assert.deepEqual(globalThis.__checkoutInvalidations,['user1']);
});
