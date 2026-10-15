import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareTestAccount} from '../auth/create-test-account.mjs';
// A normal, isolated password account exercises the deployed API, D1 and R2.
// Credentials and signed object URLs remain in memory and never enter logs.
const base='https://ca-progress-v2.habeebaasif622.workers.dev';
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)throw Error('Cloudflare credentials required.');
const password=randomBytes(28).toString('base64url');
const fixture=prepareTestAccount({username:`upload_${randomBytes(6).toString('hex')}`,password,displayName:'Upload verification fixture'});
const quote=value=>`'${value.replaceAll("'","''")}'`,owner=quote(fixture.userId);
const folder=mkdtempSync(join(tmpdir(),'ca-upload-live-'));
let cookie='',uploadId='',created=false,stage='provision fixture';
function cli(args){const result=spawnSync('npx',['wrangler',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024,timeout:120000});if(result.status!==0)throw Error(`Cloudflare operation failed during ${stage}`);return result.stdout;}
function query(sql){const output=cli(['d1','execute','ca-progress-v2-phase4-shadow','--remote','--config=wrangler.jsonc','--json','--command',sql]);const data=JSON.parse(output.slice(output.indexOf('[')));assert.ok(data.every(item=>item.success));return data[0]?.results||[];}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function request(path,body,expected=200,extra={}){const response=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(120000),method:body===undefined?'GET':'POST',headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...extra.headers},body:body===undefined?undefined:JSON.stringify(body),...extra});if(response.status!==expected){await response.body?.cancel();throw Error(`${stage}: HTTP ${response.status}, expected ${expected}`);}return response;}
const transfer=(body,expected=200)=>request('/api/v1/resources/transfers',{ownerId:fixture.userId,uploadId,...body},expected);
try{
 const file=join(folder,'fixture.sql');writeFileSync(file,fixture.sql,{mode:0o600});created=true;cli(['d1','execute','ca-progress-v2-phase4-shadow','--remote','--config=wrangler.jsonc',`--file=${file}`]);
 console.log('PASS isolated normal upload test account provisioned');stage='normal account login';const login=await request('/api/v1/password-auth',{action:'login',username:fixture.username,password,remember:true});cookie=login.headers.get('set-cookie')?.match(/(?:^|,\s*)(ca_session=[A-Za-z0-9_-]+)/)?.[1]||'';assert.ok(cookie,'Session cookie missing');await login.body?.cancel();
 console.log('PASS live normal account signed in');const bytes=Buffer.alloc(12*1024*1024+123,32);bytes.write('%PDF-1.7\n');bytes.write('\n%%EOF',bytes.length-6);const sha256=digest(bytes);
 stage='create blank-location transfer';const issued=await(await request('/api/v1/resources/transfers',{action:'create',ownerId:fixture.userId,clientId:randomUUID(),sha256,filename:'upload-verification.pdf',mimeType:'application/pdf',sizeBytes:bytes.length,title:'Private upload verification',description:'',subjectId:'',chapterId:'',visibility:'private'},201)).json();uploadId=issued.uploadId;assert.ok(uploadId);console.log('PASS live blank-location transfer created');
 for(let offset=0,part=1;offset<bytes.length;offset+=5*1024*1024,part++){stage=`upload part ${part}`;const chunk=bytes.subarray(offset,offset+5*1024*1024);const response=await request(`/api/v1/resources/transfers/${uploadId}/parts/${part}`,undefined,200,{method:'PUT',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/octet-stream','X-CA-Owner':fixture.userId,'X-Part-SHA256':digest(chunk)},body:chunk});await response.body?.cancel();console.log(`PASS live upload part ${part}`);}
 stage='verify three durable receipts';const status=await(await request(`/api/v1/resources/transfers?id=${uploadId}`)).json();assert.equal(status.parts.length,3);
 stage='finalize under real foreign keys';const completed=await(await transfer({action:'complete'},201)).json();assert.ok(completed.id);const replay=await(await transfer({action:'complete'})).json();assert.equal(replay.id,completed.id);console.log('PASS live resource saved and retry is idempotent');
 const rows=query(`SELECT u.id,u.subject_id,u.chapter_id,u.size_bytes,i.content_sha256,i.state FROM uploaded_resources u JOIN resource_inspections i ON i.resource_id=u.id WHERE u.owner_user_id=${owner}`);assert.equal(rows.length,1);assert.equal(rows[0].subject_id,null);assert.equal(rows[0].chapter_id,null);assert.equal(rows[0].size_bytes,bytes.length);assert.equal(rows[0].content_sha256,sha256);assert.equal(rows[0].state,'unsupported');
 stage='download exact private original';const access=await request(`/api/resources/${completed.id}/access?download=1`,undefined,307);const signed=access.headers.get('location');assert.ok(signed);await access.body?.cancel();const downloaded=await fetch(signed,{signal:AbortSignal.timeout(120000)});assert.equal(downloaded.status,200);assert.equal(digest(Buffer.from(await downloaded.arrayBuffer())),sha256);
 console.log('PASS live normal-account upload: three real parts, blank location, finalization, idempotent retry and exact private download');
}catch(error){console.error(`FAIL live upload stage: ${stage}; ${error instanceof Error?error.message:'verification failed'}`);throw Error(`Live upload roundtrip failed during ${stage}`);}finally{
 try{
  if(created){
   stage='fixture cleanup';
   // Use the deployed binding through authenticated cancellation, so cleanup
   // needs no broader R2 account permissions. Restrict every SQL change to this
   // newly provisioned manual-test owner and preserve intents until bytes go.
   query(`DELETE FROM uploaded_resources WHERE owner_user_id=${owner}; UPDATE resource_transfers SET state='uploaded',lease_token=NULL,lease_until=NULL WHERE owner_user_id=${owner} AND state='completed';`);
   const intents=query(`SELECT t.intent_id FROM resource_transfers t JOIN r2_upload_intents i ON i.id=t.intent_id WHERE i.user_id=${owner} AND t.owner_user_id=${owner}`);
   for(const intent of intents){uploadId=intent.intent_id;const result=await(await transfer({action:'cancel'})).json();assert.equal(result.cancelled,true);}
   query(`DELETE FROM r2_upload_intents WHERE user_id=${owner};`);
   assert.equal(query(`SELECT id FROM uploaded_resources WHERE owner_user_id=${owner}`).length,0);
   console.log('PASS live upload fixture resources and original bytes removed');
  }
 }finally{
  try{if(created)query(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE application_user_id=${owner} AND revoked_at IS NULL; UPDATE app_users SET account_state='disabled' WHERE user_id=${owner} AND auth_provider='manual-test';`);}finally{rmSync(folder,{recursive:true,force:true});}
 }
}
