import {sha256} from '@noble/hashes/sha256';
import {boundedBytes,contentHash,inspectBytes,INSPECTION_MAX_BYTES} from './inspection';
export const LARGE_PREVIEW_UNAVAILABLE='Large-file preview is unavailable. Download the original to open it.';
export class InvalidResourceBytes extends Error{}
const ascii=(v:Uint8Array)=>new TextDecoder('latin1').decode(v);
const starts=(bytes:Uint8Array,expected:number[],offset=0)=>expected.every((v,i)=>bytes[offset+i]===v);
/** Bounded container checks for download-only originals. Never expands archives. */
function inspectLargeEnvelope(head:Uint8Array,tail:Uint8Array,size:number,extension:string){
 const bad=(message:string):never=>{throw new InvalidResourceBytes(message);};
 const view=new DataView(head.buffer,head.byteOffset,head.byteLength);
 if(extension==='pdf'){if(!starts(head,[37,80,68,70,45])||!ascii(tail.subarray(Math.max(0,tail.length-2048))).includes('%%EOF'))bad('PDF is truncated or has an invalid signature.');return;}
 if(extension==='doc'){if(!starts(head,[208,207,17,224,161,177,26,225]))bad('DOC structure is invalid.');return;}
 if(extension==='docx'){
  if(!starts(head,[80,75,3,4]))bad('DOCX signature is invalid.');
  const t=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);let end=-1;for(let at=tail.length-22;at>=Math.max(0,tail.length-65557);at--)if(t.getUint32(at,true)===0x06054b50){end=at;break;}
  if(end<0)bad('DOCX directory is missing.');const count=t.getUint16(end+10,true),length=t.getUint32(end+12,true),offset=t.getUint32(end+16,true),base=size-tail.length;
  if(count>2048||length>2*1024*1024||offset<base||offset+length>base+end||end+22+t.getUint16(end+20,true)!==tail.length)bad('DOCX directory is invalid or exceeds its inspection budget.');
  let at=offset-base,document=false,types=false;
  for(let i=0;i<count;i++){
   if(at+46>tail.length||t.getUint32(at,true)!==0x02014b50)bad('DOCX directory is truncated.');
   const flags=t.getUint16(at+8,true),method=t.getUint16(at+10,true),compressed=t.getUint32(at+20,true),expanded=t.getUint32(at+24,true),nameLength=t.getUint16(at+28,true),extra=t.getUint16(at+30,true),comment=t.getUint16(at+32,true),local=t.getUint32(at+42,true);
   const next=at+46+nameLength+extra+comment;if(next>offset-base+length||local+30+compressed>size)bad('DOCX entry is truncated.');const name=new TextDecoder().decode(tail.subarray(at+46,at+46+nameLength));
   if(flags&1||![0,8].includes(method)||compressed&&expanded/compressed>100||/vbaProject|\.exe$|\.js$/i.test(name)||name.includes('..')||name.startsWith('/'))bad('Active, encrypted or unsafe DOCX content is not allowed.');
   if(name==='word/document.xml')document=true;if(name==='[Content_Types].xml')types=true;at=next;
  }
  if(!document||!types)bad('ZIP is not a Word document.');return;
 }
 if(extension==='png'){if(!starts(head,[137,80,78,71,13,10,26,10])||ascii(head.subarray(12,16))!=='IHDR'||!starts(tail,[0,0,0,0,73,69,78,68,174,66,96,130],tail.length-12))bad('PNG structure is invalid.');const w=view.getUint32(16),h=view.getUint32(20);if(!w||!h||w>16000||h>16000||w*h>24000000)bad('Image dimensions exceed the safe image budget.');return;}
 if(extension==='jpg'||extension==='jpeg'){if(!starts(head,[255,216,255])||tail.at(-2)!==255||tail.at(-1)!==217)bad('JPEG structure is invalid.');return;}
 if(extension==='webp'){if(ascii(head.subarray(0,4))!=='RIFF'||ascii(head.subarray(8,12))!=='WEBP'||view.getUint32(4,true)+8!==size)bad('WebP structure is invalid.');return;}
 bad('This file type is unsupported.');
}
/** Hash every byte while retaining only a prefix and bounded container directory. */
export async function inspectResourceSource(stream:ReadableStream<Uint8Array>,size:number,extension:string,onProgress?:()=>Promise<void>){
 if(!Number.isSafeInteger(size)||size<=0)throw new InvalidResourceBytes('File size is invalid.');
 if(size<=INSPECTION_MAX_BYTES){const bytes=await boundedBytes(stream,size);if(bytes.length!==size)throw new InvalidResourceBytes('Source size changed.');try{inspectBytes(bytes,extension);}catch(error){throw new InvalidResourceBytes(error instanceof Error?error.message:'File inspection failed.');}return {hash:await contentHash(bytes),bytes,large:false};}
 const reader=stream.getReader(),hash=sha256.create(),head=new Uint8Array(Math.min(65536,size)),tail=new Uint8Array(Math.min(2*1024*1024+65557,size));let read=0,headAt=0,tailAt=0,lastProgress=Date.now();
 try{for(;;){const{value,done}=await reader.read();if(done)break;if(read+value.length>size)throw new InvalidResourceBytes('Source size changed.');hash.update(value);if(headAt<head.length){const chunk=value.subarray(0,head.length-headAt);head.set(chunk,headAt);headAt+=chunk.length;}
  // Ring buffer: memory stays constant even for multi-gigabyte sources.
  const chunk=value.length>tail.length?value.subarray(value.length-tail.length):value;let at=0;while(at<chunk.length){const count=Math.min(chunk.length-at,tail.length-tailAt);tail.set(chunk.subarray(at,at+count),tailAt);tailAt=(tailAt+count)%tail.length;at+=count;}read+=value.length;if(onProgress&&Date.now()-lastProgress>30000){await onProgress();lastProgress=Date.now();}
 }if(read!==size)throw new InvalidResourceBytes('Source size changed.');const suffix=new Uint8Array(tail.length);suffix.set(tail.subarray(tailAt));suffix.set(tail.subarray(0,tailAt),tail.length-tailAt);inspectLargeEnvelope(head,suffix,size,extension);return {hash:Array.from(hash.digest(),v=>v.toString(16).padStart(2,'0')).join(''),bytes:null,large:true};
 }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();hash.destroy();}
}
