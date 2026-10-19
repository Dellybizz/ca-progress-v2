import {spawn} from 'node:child_process';
const [command,...args]=process.argv.slice(2);
if(!command)throw new Error('A deployment command is required.');
let exitCode=1;
for(let attempt=1;attempt<=3;attempt++){
 let output='';
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['inherit','pipe','pipe'],shell:false});
  for(const [stream,target] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>{target.write(chunk);output=(output+chunk.toString()).slice(-32000);});
  child.on('error',reject);child.on('close',code=>resolve(code??1));
 });
 exitCode=result;
 if(result===0||attempt===3||!output.includes('Received a malformed response from the API'))break;
 // Re-publishing the same build is safe. Never retry unrelated migration or validation errors.
 console.error(`Cloudflare returned malformed deployment metadata; retrying the same build (${attempt+1}/3).`);
 await new Promise(resolve=>setTimeout(resolve,attempt*5000));
}
process.exitCode=exitCode;
