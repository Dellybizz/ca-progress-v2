import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckoutPreparation} from '../lib/billing/checkout-preparation.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
test('review and Continue share one preparation, and consumed checkout is not cancelled',async()=>{
 const manager=createCheckoutPreparation();let prepares=0,cancels=0;
 const prepare=async()=>{prepares++;return {subscriptionId:'sub_1'};},cancel=async()=>{cancels++;};
 const warm=manager.warm('pro-upi',prepare,cancel);assert.equal(manager.warm('pro-upi',prepare,cancel),warm);
 assert.deepEqual(await manager.take('pro-upi',prepare,cancel),{subscriptionId:'sub_1'});await manager.discard();
 assert.equal(prepares,1);assert.equal(cancels,0);
});
test('closing review during creation cancels its eventual unpaid setup',async()=>{
 const manager=createCheckoutPreparation();let resolve;const cancelled=[];
 manager.warm('pro',()=>new Promise(done=>{resolve=done;}),async value=>cancelled.push(value));await flush();
 const closing=manager.discard();resolve({subscriptionId:'sub_1'});await closing;
 assert.deepEqual(cancelled,[{subscriptionId:'sub_1'}]);
});
test('switching method waits for closure before creating another setup',async()=>{
 const manager=createCheckoutPreparation(),events=[];let close;
 await manager.warm('upi',async()=>{events.push('create-upi');return 'sub_1';},()=>new Promise(resolve=>{events.push('close-upi');close=resolve;}));
 const next=manager.warm('card',async()=>{events.push('create-card');return 'sub_2';},async()=>{});await flush();
 assert.deepEqual(events,['create-upi','close-upi']);close();assert.equal(await next,'sub_2');assert.deepEqual(events,['create-upi','close-upi','create-card']);
});
test('failed preparation is discarded and a later Continue can retry normally',async()=>{
 const manager=createCheckoutPreparation();await assert.rejects(manager.warm('pro',async()=>{throw new Error('rejected');},async()=>{}));
 assert.equal(await manager.take('pro',async()=> 'sub_2',async()=>{}),'sub_2');
});
test('Continue during an in-flight preparation protects that setup from review cleanup',async()=>{
 const manager=createCheckoutPreparation();let resolve,cancels=0;
 manager.warm('pro',()=>new Promise(done=>{resolve=done;}),async()=>{cancels++;});await flush();
 const checkout=manager.take('pro',async()=>{throw new Error('duplicate create');},async()=>{cancels++;});await manager.discard();resolve('sub_1');assert.equal(await checkout,'sub_1');assert.equal(cancels,0);
});

test('a cancellation transport failure does not permanently disable retry; server still owns duplicate protection',async()=>{
 const manager=createCheckoutPreparation();await manager.warm('pro',async()=> 'sub_1',async()=>{throw new Error('close response lost');});
 await assert.rejects(manager.discard());assert.equal(await manager.take('pro',async()=> 'server_verified_setup',async()=>{}),'server_verified_setup');
});
