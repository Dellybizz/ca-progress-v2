import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['lib/resources/workspace-page-cache.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const cache=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const page=name=>({files:[{name}],total:1,nextCursor:null,folders:[],path:[]});
test('workspace cache deduplicates requests and scopes snapshots to each owner/context',async t=>{
 globalThis.window={};let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(page('original'));});
 const [a,b]=await Promise.all([cache.loadWorkspacePage('alice:inter','/dedupe'),cache.loadWorkspacePage('alice:inter','/dedupe')]);assert.equal(calls,1);assert.equal(a,b);
 assert.equal(await cache.loadWorkspacePage('alice:inter','/dedupe'),a);assert.equal(calls,1);
 assert.equal(cache.peekWorkspacePage('bob:inter','/dedupe'),undefined);assert.equal(cache.peekWorkspacePage('alice:final','/dedupe'),undefined);
 await cache.loadWorkspacePage('bob:inter','/dedupe');assert.equal(calls,2);
 cache.invalidateWorkspacePages('alice:inter');assert.equal(cache.peekWorkspacePage('alice:inter','/dedupe'),undefined);assert.ok(cache.peekWorkspacePage('bob:inter','/dedupe'));
});
test('a response started before a mutation cannot repopulate the cache with stale files',async t=>{
 globalThis.window={};let release,calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;if(calls===1)return new Promise(resolve=>{release=()=>resolve(Response.json(page('stale')));});return Response.json(page('current'));});
 const request=cache.loadWorkspacePage('race','/race');cache.invalidateWorkspacePages('race');release();
 assert.equal((await request).files[0].name,'current');assert.equal(calls,2);assert.equal(cache.peekWorkspacePage('race','/race').data.files[0].name,'current');
});
test('private page snapshots are bounded, expire for revalidation and never appear during server rendering',async t=>{
 globalThis.window={};let now=1000,calls=0;t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(page('page'));});
 await cache.loadWorkspacePage('bounded','/fresh');now+=16000;await cache.loadWorkspacePage('bounded','/fresh');assert.equal(calls,2);
 for(let i=0;i<50;i++)await cache.loadWorkspacePage('bounded','/bounded/'+i);assert.equal(cache.peekWorkspacePage('bounded','/bounded/0'),undefined);assert.ok(cache.peekWorkspacePage('bounded','/bounded/49'));
 delete globalThis.window;assert.equal(cache.peekWorkspacePage('bounded','/bounded/49'),undefined);
});
