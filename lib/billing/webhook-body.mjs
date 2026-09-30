export async function readWebhookBytes(request,limit=512000){
 const reader=request.body?.getReader();if(!reader)return new ArrayBuffer(0);
 const chunks=[];let length=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Object.assign(new Error('Webhook payload is too large.'),{status:413});}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes.buffer;
}
