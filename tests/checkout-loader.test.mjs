import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCheckout} from '../lib/billing/checkout-loader.mjs';
test('Razorpay preload and simultaneous checkout callers share one script and recover after a failed download',async()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,elements=[];
 class Element extends EventTarget{remove(){elements.splice(elements.indexOf(this),1);}}
 globalThis.window={};globalThis.document={createElement:()=>new Element(),head:{appendChild:e=>elements.push(e)},querySelector:query=>elements.find(e=>query.startsWith('script')?e.src==='https://checkout.razorpay.com/v1/checkout.js':e.rel==='preconnect'&&query.includes(e.href))??null};
 try{
 const preload=loadCheckout(),click=loadCheckout();assert.equal(preload,click);assert.equal(elements.filter(e=>e.src).length,1);
 elements.find(e=>e.src).dispatchEvent(new Event('error'));assert.equal(await preload,false);assert.equal(await click,false);assert.equal(elements.filter(e=>e.src).length,0);
 const retry=loadCheckout(),other=loadCheckout();assert.equal(retry,other);assert.equal(elements.filter(e=>e.rel==='preconnect').length,3);assert.equal(elements.filter(e=>e.src).length,1);
 globalThis.window.Razorpay=function(){};elements.find(e=>e.src).dispatchEvent(new Event('load'));assert.equal(await retry,true);assert.equal(await loadCheckout(),true);assert.equal(elements.filter(e=>e.src).length,1);
 }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
test('server render never attempts to load checkout',async()=>{assert.equal(await loadCheckout(),false);});
