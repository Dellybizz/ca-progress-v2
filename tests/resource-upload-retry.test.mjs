import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
const dir=await mkdtemp(path.join(process.cwd(),'.upload-retry-test-'));let handler;
try{
 const result=await build({stdin:{contents:"export {POST} from './app/api/resources/upload-complete/route';export {setFixture} from '@/lib/data/d1/runtime';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'adapters',setup(b){
 b.onResolve({filter:/^(next\/server|@\/lib\/)/},args=>({path:args.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},args=>{
  const sources={
   'next/server':'export const NextResponse={json:(data,init)=>Response.json(data,init)};',
   '@/lib/auth/server':"export const optionalUser=async()=>({id:'owner'});",
   '@/lib/data/d1/runtime':`let fixture;export const setFixture=value=>{fixture=value};export const getHotD1Database=()=>({prepare(sql){return {bind(...values){return {async first(){if(sql.includes('r2_upload_intents'))return fixture.intent;if(sql.includes('uploaded_resources')){if(values[0]!=='owner'||values[1]!=='private/key')throw new Error('Missing owner scope');return fixture.resource;}throw new Error('Unexpected query');}}}}}});`,
   '@/lib/billing/service':"export const getResourceStorageAccess=()=>{throw new Error('Must not check quota or insert on completion retry')};export const createResourceMetadataWithinQuota=getResourceStorageAccess;",
   '@/lib/resources/r2':"export const RESOURCE_R2_STORAGE_BUCKET='resources';export const getResourceR2Bucket=()=>{throw new Error('Must not access bytes on completed retry')};",
   '@/lib/jobs/queue':"export const enqueueBackgroundJob=()=>{throw new Error('Must not enqueue duplicate processing')};export const jobKey=()=>'';",
   '@/lib/resources/validation':"export const normalizeFilename=value=>value;",
  };if(!sources[args.path])throw new Error(args.path);return {contents:sources[args.path]};
 });}}]});const file=path.join(dir,'route.mjs');await writeFile(file,result.outputFiles[0].text);handler=await import('file://'+file);
}finally{await rm(dir,{recursive:true,force:true});}
const request=()=>new Request('https://ca.test/api/resources/upload-complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId:'intent'})});
test('retrying a completed upload returns the owned existing file without duplicate metadata or processing',async()=>{
 handler.setFixture({intent:{user_id:'owner',status:'completed',object_key:'private/key'},resource:{id:'saved-file',moderation_status:'private'}});
 const response=await handler.POST(request());assert.equal(response.status,200);assert.equal((await response.json()).id,'saved-file');assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('completion retry cannot reveal another owner or resurrect deleted and failed uploads',async()=>{
 handler.setFixture({intent:{user_id:'someone-else',status:'completed'},resource:{id:'secret'}});assert.equal((await handler.POST(request())).status,404);
 handler.setFixture({intent:{user_id:'owner',status:'completed',object_key:'private/key'},resource:null});assert.equal((await handler.POST(request())).status,409);
 handler.setFixture({intent:{user_id:'owner',status:'failed',object_key:'private/key'},resource:null});assert.equal((await handler.POST(request())).status,409);
});
