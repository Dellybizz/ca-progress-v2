import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {verifyLiveUploadBoundary} from '../resources/verify-live-upload-boundary.mjs';
const output=process.argv[2]||'deployment-evidence/file-manager-phase0/live-baseline.json';
const base='https://ca-progress-v2.habeebaasif622.workers.dev';
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)throw Error('Cloudflare credentials required for the scoped fixture audit.');
const configResponse=await fetch(base+'/api/app-config',{signal:AbortSignal.timeout(30000)});assert.equal(configResponse.status,200);const config=await configResponse.json();assert.match(config.deployedCommit,/^[a-f0-9]{40}$/);
await verifyLiveUploadBoundary({expectedCommit:config.deployedCommit});
const temp=await mkdtemp(join(tmpdir(),'ca-fmp0-live-'));
const token=randomBytes(32).toString('hex');let child;
try{
 const main=join(temp,'audit.mjs');
 await writeFile(main,`import {auditFixtureObjects} from ${JSON.stringify(resolve('scripts/file-manager/fixture-object-audit.mjs'))};
 export default {async fetch(request,env){if(request.headers.get('Authorization')!=='Bearer '+env.AUDIT_TOKEN)return new Response('Denied',{status:403});if(request.method==='GET')return Response.json({ready:true});if(request.method!=='POST')return new Response('Denied',{status:405});const body=await request.json();if(body.action==='baseline'){const versions=(await env.DB.prepare("SELECT version FROM _ca_schema_migrations WHERE version IN ('0095','0096','0097','0098') ORDER BY version").all()).results;const foreign_keys=(await env.DB.prepare('PRAGMA foreign_key_check').all()).results.length;const totals=await env.DB.prepare('SELECT (SELECT count(*) FROM notes) notes,(SELECT count(*) FROM uploaded_resources) uploads,(SELECT count(*) FROM resource_transfers) transfers').first();return Response.json({versions:versions.map(v=>v.version),foreign_key_violations:foreign_keys,totals});}if(body.action==='audit'||body.action==='apply')return Response.json(await auditFixtureObjects(env,{apply:body.action==='apply'}));return new Response('Denied',{status:400});}};`,{mode:0o600});
 const cfg=join(temp,'wrangler.json');
 await writeFile(cfg,JSON.stringify({name:'ca-file-manager-local-audit',main,compatibility_date:'2026-09-01',vars:{AUDIT_TOKEN:token},d1_databases:[{binding:'DB',database_name:'ca-progress-v2-phase4-shadow',database_id:'6f002cbe-fe40-4d1b-9cf4-df6faaf52350',remote:true}],r2_buckets:[{binding:'BUCKET',bucket_name:'ca-progress-v2-staging-user-resources',remote:true}]}),{mode:0o600});
 child=spawn(resolve('node_modules/.bin/wrangler'),['dev','--config',cfg,'--ip','127.0.0.1','--port','8793','--log-level','error'],{stdio:['ignore','pipe','pipe'],detached:true});
 let exited=false;child.once('exit',()=>{exited=true;});let diagnostic='';
 const capture=chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-4000);};child.stdout.on('data',capture);child.stderr.on('data',capture);
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};let ready=false;
 for(let n=0;n<50;n++){if(exited)break;try{const response=await fetch('http://127.0.0.1:8793/health',{headers,signal:AbortSignal.timeout(1000)});if(response.ok){await response.body?.cancel();ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
 if(!ready){const code=diagnostic.match(/(?:code|Code)[:= ]+(\d{3,8})/)?.[1]||'unavailable';throw Error(`Remote binding audit did not start (provider code ${code}); no cleanup was requested.`);}
 async function request(action){const response=await fetch('http://127.0.0.1:8793/',{method:'POST',headers,body:JSON.stringify({action}),signal:AbortSignal.timeout(90000)});if(!response.ok){await response.body?.cancel();throw Error(`Scoped ${action} failed (HTTP ${response.status}); inspect private runtime logs without exposing credentials.`);}return response.json();}
 const database=await request('baseline');assert.deepEqual(database.versions,['0095','0096','0097','0098']);assert.equal(database.foreign_key_violations,0);
 const before=await request('audit');assert.equal(before.fixture_accounts,1,'Historical fixture account must be uniquely identified before closing its cleanup audit.');const cleanup=before.verified_orphans?await request('apply'):null;const after=await request('audit');assert.equal(after.remaining_verified_orphans,0);
 const evidence={generated_at:new Date().toISOString(),deployed_commit:config.deployedCommit,live_upload_boundaries:'passed',database,fixture_audit_before:before,fixture_cleanup:cleanup,fixture_audit_after:after,scope:'Narrow disabled manual-test account window, exact synthetic size/hash, no references; no general user-object sweep'};
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({phase0_live:'passed',foreign_key_violations:0,verified_test_objects_removed:cleanup?.deleted||0,remaining_verified_test_objects:0,deployed_commit:config.deployedCommit}));
}finally{
 if(child?.pid){try{process.kill(-child.pid,'SIGINT');}catch{}await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(r=>setTimeout(r,4000))]);try{process.kill(-child.pid,'SIGKILL');}catch{}}
 await rm(temp,{recursive:true,force:true});
}
