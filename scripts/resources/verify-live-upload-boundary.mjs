import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
// Negative authentication probes: synthetic bytes, no account or real intent,
// no storage writes. A bounded readiness wait accounts for Worker edge rollout.
export async function verifyLiveUploadBoundary({origin='https://ca-progress-v2.habeebaasif622.workers.dev',expectedCommit,fetcher=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxAttempts=7,delayMs=12000,log=console.log}={}){
 const path='/api/v1/resources/transfers/2b809c2b-3cb9-4de1-8d2c-4385c12f97af/parts/1';
 async function probe(label,url,init,expected,validate,retryStatuses){
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   let response;try{response=await fetcher(url,{...init,signal:AbortSignal.timeout(30000)});}catch(error){if(attempt===maxAttempts)throw error;log(`Waiting for edge rollout: ${label}, attempt ${attempt}/${maxAttempts}`);await wait(delayMs);continue;}
   if(response.status===expected){const payload=await response.json();if(await validate(payload))return payload;}
   else{const status=response.status;await response.body?.cancel();if(!retryStatuses.includes(status)||attempt===maxAttempts)throw Error(`${label}: expected HTTP ${expected}, received HTTP ${status}`);}
   if(attempt===maxAttempts)throw Error(`${label}: the expected deployed version did not become ready.`);
   log(`Waiting for edge rollout: ${label}, attempt ${attempt}/${maxAttempts}`);await wait(delayMs);
  }
 }
 if(expectedCommit){await probe('deployed source',origin+'/api/app-config',{cache:'no-store'},200,payload=>payload.deployedCommit===expectedCommit,[502,503,504]);log('PASS live app-config reports the expected deployed commit');}
 for(const [label,body,type,extra]of [
  ['small binary part',new Uint8Array(512),'application/octet-stream',{}],
  ['full binary part',new Uint8Array(5*1024*1024),'application/octet-stream',{}],
  ['native JSON envelope',JSON.stringify({base64:Buffer.alloc(5*1024*1024).toString('base64')}),'application/json',{'Origin':'capacitor://localhost','X-CA-Native-App':'in.zanisheluxe.caprogress'}],
 ]){
  await probe(label,origin+path,{method:'PUT',redirect:'manual',headers:{'Content-Type':type,Origin:origin,'X-CA-Owner':'boundary-probe','X-Part-SHA256':'a'.repeat(64),...extra},body},401,payload=>{assert.match(JSON.stringify(payload),/Authentication required/);return true;},[413,415,502,503,504]);
  log(`PASS live ${label}: middleware accepts transport and application rejects unauthenticated access (401)`);
 }
 await probe('ordinary JSON limit',origin+'/api/v1/notes',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:' '.repeat(1000001)},413,payload=>{assert.equal(payload.error?.code,'PAYLOAD_TOO_LARGE');return true;},[502,503,504]);
 log('PASS live ordinary JSON limit remains enforced (413)');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyLiveUploadBoundary({expectedCommit:process.env.DEPLOY_SHA});
