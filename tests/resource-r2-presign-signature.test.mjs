import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AwsV4Signer} from 'aws4fetch';
const dir=await mkdtemp(join(tmpdir(),'r2-signature-'));
let presign;
try{
 const bundle=await build({entryPoints:['lib/resources/r2-presign.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'context',setup(b){b.onResolve({filter:/^(server-only|@opennextjs\/cloudflare)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='server-only'?'':`export const getCloudflareContext=()=>({env:{R2_ACCOUNT_ID:'fixture',R2_ACCESS_KEY_ID:'fixture-access',R2_SECRET_ACCESS_KEY:'fixture-secret'}});`}));}}]});await writeFile(join(dir,'sign.mjs'),bundle.outputFiles[0].text);presign=(await import('file://'+join(dir,'sign.mjs'))).createR2PresignedUrl;
}finally{await rm(dir,{recursive:true,force:true});}
for(const method of ['GET','PUT'])test(`R2 ${method} signature matches an independent SigV4 signer including encoded paths and response overrides`,async()=>{
 const signed=await presign({method,key:'files/owner/Revision + café.pdf',contentType:'application/pdf',responseContentDisposition:'attachment; filename="Revision + café.pdf"',responseContentType:'application/pdf'});const url=new URL(signed.url),actual=url.searchParams.get('X-Amz-Signature'),datetime=url.searchParams.get('X-Amz-Date');url.searchParams.delete('X-Amz-Signature');
 const expected=await new AwsV4Signer({method,url:url.toString(),accessKeyId:'fixture-access',secretAccessKey:'fixture-secret',service:'s3',region:'auto',datetime,signQuery:true,allHeaders:true,headers:method==='PUT'?{'Content-Type':'application/pdf'}:{}}).sign();assert.equal(actual,new URL(expected.url).searchParams.get('X-Amz-Signature'));
 if(method==='GET'){const keys=[...new URL(signed.url).searchParams.keys()].filter(key=>key!=='X-Amz-Signature');assert.deepEqual(keys,[...keys].sort());}
});
