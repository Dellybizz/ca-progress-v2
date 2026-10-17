import type {ResourceR2Bucket} from './r2';
import {TRANSFER_PART_BYTES} from './transfers';
/** Copy immutable originals without buffering an entire file or issuing a >5GiB PUT. */
export async function copyResourceStream(bucket:ResourceR2Bucket,key:string,body:ReadableStream<Uint8Array>,size:number,mime:string){
 if(size<=TRANSFER_PART_BYTES){await bucket.put(key,body,{httpMetadata:{contentType:mime}});return;}
 const upload=await bucket.createMultipartUpload(key,{httpMetadata:{contentType:mime}}),multipart=bucket.resumeMultipartUpload(key,upload.uploadId),reader=body.getReader();let buffer=new Uint8Array(TRANSFER_PART_BYTES),filled=0,read=0;const parts:{partNumber:number;etag:string}[]=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;read+=value.length;if(read>size)throw Error('Source size changed.');let at=0;while(at<value.length){const length=Math.min(value.length-at,buffer.length-filled);buffer.set(value.subarray(at,at+length),filled);at+=length;filled+=length;if(filled===buffer.length){parts.push(await multipart.uploadPart(parts.length+1,buffer));buffer=new Uint8Array(TRANSFER_PART_BYTES);filled=0;}}}if(read!==size)throw Error('Source size changed.');if(filled)parts.push(await multipart.uploadPart(parts.length+1,buffer.subarray(0,filled)));await multipart.complete(parts);
 }catch(error){await multipart.abort().catch(()=>undefined);throw error;}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
