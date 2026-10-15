import {sha256} from '@noble/hashes/sha256';
export type TransferDescriptor={filename:string;mimeType:string;sizeBytes:number;title:string;description?:string;subjectId?:string;chapterId?:string;visibility:'private'|'shared'};
export type QueuedUpload={id:string;idempotencyId?:string;owner:string;descriptor:TransferDescriptor;sha256:string;uploadId?:string;state:'queued'|'uploading'|'paused'|'failed'|'duplicate'|'complete'|'reselect';progress:number;error?:string;allowDuplicate?:boolean;resourceId?:string;createdAt:string};
export type TransferApi=(url:string,init?:RequestInit)=>Promise<Record<string,unknown>>;
export class UploadClientError extends Error{constructor(message:string,public status:number,public code=''){super(message);}}
export async function fileHash(file:Blob){const hash=sha256.create();for(let offset=0;offset<file.size;offset+=5*1024*1024)hash.update(new Uint8Array(await file.slice(offset,offset+5*1024*1024).arrayBuffer()));return Array.from(hash.digest(),v=>v.toString(16).padStart(2,'0')).join('');}
export async function browserTransferApi(url:string,init:RequestInit={}){const response=await fetch(url,{...init,credentials:'same-origin',cache:'no-store'});const payload=await response.json().catch(()=>null);if(!response.ok)throw new UploadClientError(typeof payload?.error==='string'?payload.error:typeof payload?.error?.message==='string'?payload.error.message:`Upload failed (HTTP ${response.status}). Your file is retained; retry to continue.`,response.status,typeof payload?.code==='string'?payload.code:typeof payload?.error?.code==='string'?payload.error.code:'');if(!payload||typeof payload!=='object')throw new UploadClientError('Upload receipt is missing. Retry to verify this file.',503);return payload as Record<string,unknown>;}
async function directPut(url:string,headers:Record<string,string>,file:Blob,signal:AbortSignal,progress:(value:number)=>void){
 return new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();const abort=()=>xhr.abort();const done=()=>signal.removeEventListener('abort',abort);if(signal.aborted){reject(new DOMException('Paused','AbortError'));return;}signal.addEventListener('abort',abort,{once:true});xhr.open('PUT',url);xhr.timeout=45000;for(const [key,value] of Object.entries(headers))xhr.setRequestHeader(key,value);xhr.upload.onprogress=e=>{if(e.lengthComputable)progress(e.loaded/e.total);};xhr.onload=()=>{done();if(xhr.status>=200&&xhr.status<300)resolve();else reject(new UploadClientError('Upload connection expired or failed. Retry this file.',xhr.status));};xhr.onerror=()=>{done();reject(new UploadClientError('Connection lost. Your file is retained for retry.',0));};xhr.ontimeout=()=>{done();reject(new UploadClientError('Direct upload timed out. Trying secure upload.',0));};xhr.onabort=()=>{done();reject(new DOMException('Paused','AbortError'));};xhr.send(file);});
}
export async function runQueuedUpload(row:QueuedUpload,file:File,input:{api:TransferApi;signal:AbortSignal;save:(row:QueuedUpload)=>Promise<void>;onProgress?:(value:number)=>void}){
 const {api,signal,save}=input;const check=()=>{if(signal.aborted)throw new DOMException('Paused','AbortError');};const post=(body:Record<string,unknown>)=>api('/api/v1/resources/transfers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,ownerId:row.owner}),signal});
 const progress=(value:number)=>{row.progress=Math.round(Math.min(98,value));input.onProgress?.(row.progress);};
 try{
  check();if(await fileHash(file)!==row.sha256)throw new UploadClientError('Reselected file does not match the original bytes.',400);
  let status:Record<string,unknown>|null=null;
  if(row.uploadId){try{status=await api(`/api/v1/resources/transfers?id=${encodeURIComponent(row.uploadId)}`,{signal});if(status.state==='completed'&&typeof status.resourceId==='string'){row.state='complete';row.progress=100;row.resourceId=status.resourceId;await save(row);input.onProgress?.(100);return row;}
    if(Date.parse(String(status.expiresAt))<=Date.now()||['cancelled','quarantined'].includes(String(status.state))){row.uploadId=undefined;row.idempotencyId=crypto.randomUUID();status=null;await save(row);}
   }catch(error){if((error as {status?:number}).status!==404)throw error;row.uploadId=undefined;status=null;await save(row);}}
  row.state='uploading';row.error=undefined;await save(row);
  if(!status){status=await post({action:'create',clientId:row.idempotencyId??row.id,sha256:row.sha256,...row.descriptor,allowDuplicate:row.allowDuplicate});if(typeof status.uploadId!=='string')throw Error('Transfer receipt is missing.');row.uploadId=status.uploadId;await save(row);}
  check();
  if(!['uploaded','completed','assembling'].includes(String(status.state))){
   if(status.multipart){const partBytes=Number(status.partBytes);if(partBytes!==5*1024*1024)throw Error('Unexpected part size.');const count=Math.ceil(file.size/partBytes);const done=new Set((status.parts as {part_number:number}[]).map(p=>p.part_number));
    for(let number=1;number<=count;number++){check();if(done.has(number)){progress(number/count*85);continue;}const part=file.slice((number-1)*partBytes,Math.min(file.size,number*partBytes));const hash=await fileHash(part);await api(`/api/v1/resources/transfers/${encodeURIComponent(row.uploadId!)}/parts/${number}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-CA-Owner':row.owner,'X-Part-SHA256':hash},body:part,signal});progress(number/count*85);await save(row);}
   }else{
    try{const access=await post({action:'renew',uploadId:row.uploadId});await directPut(String(access.uploadUrl),access.headers as Record<string,string>,file,signal,value=>progress(value*85));}
    catch(error){
     check();
     // Some networks and browser policies block the cross-origin R2 request.
     // Retry the same reserved object through our authenticated origin, retaining
     // the transfer ID, exact size/hash checks and normal inspection/finalization.
     if(error instanceof UploadClientError&&[401,409,410].includes(error.status))throw error;
     await api(`/api/v1/resources/transfers/${encodeURIComponent(row.uploadId!)}/parts/1`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-CA-Owner':row.owner,'X-Part-SHA256':row.sha256},body:file,signal});progress(85);
    }
   }
  }
  check();progress(95);const receipt=await post({action:'complete',uploadId:row.uploadId});if(typeof receipt.id!=='string')throw Error('File receipt is missing. Retry verification.');row.resourceId=receipt.id;row.state='complete';row.progress=100;await save(row);input.onProgress?.(100);return row;
 }catch(error){row.state=(error as {code?:string}).code==='DUPLICATE_FILE'?'duplicate':signal.aborted?'paused':'failed';row.error=error instanceof Error?error.message:'Upload failed. Retry this file.';await save(row);throw error;}
}
export async function imageThumbnail(file:File){
 if(file.size>10*1024*1024)return null;
 if(file.type==='application/pdf'){
  if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return null;
  const worker=new Worker(new URL('/resource-preview/pdf-thumbnail-worker.mjs',location.href),{type:'module'});
  try{const bytes=await file.arrayBuffer();return await new Promise<Blob|null>(resolve=>{const timeout=setTimeout(()=>{worker.terminate();resolve(null);},15000);worker.onmessage=event=>{clearTimeout(timeout);resolve(event.data.blob instanceof Blob?event.data.blob:null);};worker.onerror=()=>{clearTimeout(timeout);resolve(null);};worker.postMessage(bytes,[bytes]);});}finally{worker.terminate();}
 }
 if(!file.type.startsWith('image/'))return null;const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>24000000)throw Error('Image is too large to preview.');const scale=Math.min(1,384/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d');if(!context)return null;context.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));return blob&&blob.size<=180000?blob:null;}finally{bitmap.close();}
}
