import 'server-only';
import {getCloudflareContext} from '@opennextjs/cloudflare';
export async function invokeResourceProcessing(resourceId:string,owner:string){
 const binding=(getCloudflareContext().env as unknown as {RESOURCE_PROCESSOR?:{fetch:(request:Request)=>Promise<Response>}}).RESOURCE_PROCESSOR;
 if(!binding)throw Error('Resource processing is not configured.');
 const response=await binding.fetch(new Request('https://resource-processor.internal/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resourceId,owner}),signal:AbortSignal.timeout(45000)}));
 if(!response.ok)throw Error('Resource processing will retry.');return response.json();
}
