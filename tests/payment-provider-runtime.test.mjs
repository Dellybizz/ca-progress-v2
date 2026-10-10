import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('production provider client runs in Workers and refuses redirects without forwarding credentials',async()=>{
 const result=await build({stdin:{contents:`import {dependencies} from './workers/billing/payment-p2';export default{async fetch(request){const redirect=new URL(request.url).pathname==='/redirect';try{const value=await dependencies({DB:{},RAZORPAY_KEY_ID:'fixture',RAZORPAY_KEY_SECRET:'fixture'},'user').provider(redirect?'redirect':'subscriptions',{method:request.method,...(request.method==='POST'?{body:'{}'}:{})});return Response.json({ok:true,value});}catch(error){return Response.json({ok:false,code:error.code,definitiveRejection:Boolean(error.definitiveRejection)});}}}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'neutral',write:false});
 const calls=[];
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-08-29',compatibilityFlags:['nodejs_compat'],outboundService:request=>{calls.push({url:request.url,method:request.method,redirect:request.redirect});return new URL(request.url).pathname.endsWith('/redirect')?new Response(null,{status:302,headers:{location:'https://untrusted.example/'}}):Response.json({id:'sub_fixture',status:'created'});}}));
 try{
  for(const method of ['GET','POST']){const response=await mf.dispatchFetch('https://test/',{method});assert.equal((await response.json()).ok,true);}
  const blocked=await (await mf.dispatchFetch('https://test/redirect')).json();assert.equal(blocked.ok,false);assert.equal(blocked.code,'provider_request_failed');assert.equal(blocked.definitiveRejection,false);
  assert.equal(calls.length,3);assert.ok(calls.every(call=>call.url.startsWith('https://api.razorpay.com/')));
 }finally{await mf.dispose();}
});
