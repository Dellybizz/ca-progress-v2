import assert from 'node:assert/strict';
// Negative authentication probes: synthetic bytes, no account, no intent and
// no storage writes. Middleware must pass valid parts to the auth boundary.
const origin='https://ca-progress-v2.habeebaasif622.workers.dev';
const path='/api/v1/resources/transfers/2b809c2b-3cb9-4de1-8d2c-4385c12f97af/parts/1';
for(const [label,body,type,extra]of [
 ['small binary part',new Uint8Array(512),'application/octet-stream',{}],
 ['full binary part',new Uint8Array(5*1024*1024),'application/octet-stream',{}],
 ['native JSON envelope',JSON.stringify({base64:Buffer.alloc(5*1024*1024).toString('base64')}),'application/json',{'Origin':'capacitor://localhost','X-CA-Native-App':'in.zanisheluxe.caprogress'}],
]){
 const response=await fetch(origin+path,{method:'PUT',redirect:'manual',headers:{'Content-Type':type,Origin:origin,'X-CA-Owner':'boundary-probe','X-Part-SHA256':'a'.repeat(64),...extra},body});
 assert.equal(response.status,401,`${label}: expected authentication rejection after middleware, received HTTP ${response.status}`);
 const payload=await response.json();assert.match(JSON.stringify(payload),/Authentication required/);console.log(`PASS live ${label}: middleware accepts transport and application rejects unauthenticated access (401)`);
}
const ordinary=await fetch(origin+'/api/v1/notes',{method:'POST',redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json'},body:' '.repeat(1000001)});
assert.equal(ordinary.status,413,'ordinary mutations must retain their existing request limit');
console.log('PASS live ordinary JSON limit remains enforced (413)');
