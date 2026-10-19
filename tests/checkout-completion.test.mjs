import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckoutCompletion} from '../lib/billing/checkout-completion.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('closing updates UI immediately, but clears the saved checkout only after confirmed cancellation',async()=>{
 const events=[];let resolve;
 const completion=createCheckoutCompletion({closed:()=>events.push('closed'),confirming:()=>events.push('confirming'),abandon:()=>new Promise(done=>{resolve=done;}),verify:()=>{throw new Error('must not verify');},abandoned:()=>events.push('clear-intent'),verified:()=>events.push('activated'),error:()=>events.push('error')});
 const work=completion.dismiss();assert.deepEqual(events,['closed']);assert.equal(completion.dismiss(),null);assert.equal(completion.paid({}),null);await flush();assert.deepEqual(events,['closed']);resolve({});assert.equal(await work,true);assert.deepEqual(events,['closed','clear-intent']);
});
test('payment immediately enters confirming UI and a dismissal cannot cancel the successful callback',async()=>{
 const events=[];let resolve;
 const completion=createCheckoutCompletion({closed:()=>events.push('closed'),confirming:()=>events.push('confirming'),abandon:()=>{throw new Error('must not cancel');},verify:()=>new Promise(done=>{resolve=done;}),abandoned:()=>events.push('clear-intent'),verified:result=>events.push(result.accessGranted?'active':'pending'),error:()=>events.push('error')});
 const work=completion.paid({});assert.deepEqual(events,['confirming']);assert.equal(completion.dismiss(),null);assert.equal(completion.paid({}),null);await flush();resolve({accessGranted:true});assert.equal(await work,true);assert.deepEqual(events,['confirming','active']);
});
test('uncertain cancellation preserves recovery instead of claiming the mandate is cancelled',async()=>{
 const events=[];const completion=createCheckoutCompletion({closed:()=>events.push('closed'),confirming:()=>{},abandon:async()=>{throw new Error('timeout');},verify:async()=>({}),abandoned:()=>events.push('clear-intent'),verified:()=>events.push('active'),error:(_reason,phase)=>events.push(phase)});
 assert.equal(await completion.dismiss(),false);assert.deepEqual(events,['closed','closing']);
});
test('bank callback without verified access stays pending',async()=>{
 const events=[];const completion=createCheckoutCompletion({closed:()=>{},confirming:()=>events.push('confirming'),abandon:async()=>{},verify:async()=>({accessGranted:false}),abandoned:()=>{},verified:result=>events.push(result.accessGranted?'active':'pending'),error:()=>{}});
 await completion.paid({});assert.deepEqual(events,['confirming','pending']);
});
