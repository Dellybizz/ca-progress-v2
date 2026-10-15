import {inflateRawSync,inflateSync} from 'node:zlib';
export const INSPECTION_MAX_BYTES=10*1024*1024;
export async function contentHash(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)),v=>v.toString(16).padStart(2,'0')).join('');}
const ascii=(bytes:Uint8Array)=>new TextDecoder('latin1').decode(bytes);
function prefix(bytes:Uint8Array,values:number[],offset=0){return values.every((v,i)=>bytes[offset+i]===v);}
function dimensions(width:number,height:number){if(!width||!height||width>16000||height>16000||width*height>24000000)throw Error('Image dimensions exceed the safe preview budget.');return {width,height};}
export function crc32(bytes:Uint8Array){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
export function inspectImage(bytes:Uint8Array,extension:string){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(extension==='png'){
  if(bytes.length<45||!prefix(bytes,[137,80,78,71,13,10,26,10])||ascii(bytes.subarray(12,16))!=='IHDR')throw Error('PNG structure is invalid.');
  const result=dimensions(view.getUint32(16),view.getUint32(20));let offset=8,ended=false;const compressed:Uint8Array[]=[];
  while(offset+12<=bytes.length){const size=view.getUint32(offset),type=ascii(bytes.subarray(offset+4,offset+8));if(size>bytes.length-offset-12)throw Error('PNG is truncated.');if(crc32(bytes.subarray(offset+4,offset+8+size))!==view.getUint32(offset+8+size))throw Error('PNG checksum is invalid.');if(type==='IDAT')compressed.push(bytes.subarray(offset+8,offset+8+size));offset+=size+12;if(type==='IEND'){ended=true;break;}}
  if(!ended||offset!==bytes.length||!compressed.length)throw Error('PNG is truncated or has trailing content.');const encoded=new Uint8Array(compressed.reduce((n,p)=>n+p.length,0));let write=0;for(const part of compressed){encoded.set(part,write);write+=part.length;}const depth=bytes[24],color=bytes[25],interlace=bytes[28];const channels:Record<number,number>={0:1,2:3,3:1,4:2,6:4};const depths:Record<number,number[]>={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};if(!depths[color]?.includes(depth)||bytes[26]!==0||bytes[27]!==0||interlace>1)throw Error('PNG encoding is invalid.');const passes=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];const rows: number[]=[];let expected=0;for(const [x,y,dx,dy]of passes){const width=Math.max(0,Math.ceil((result.width-x)/dx)),height=Math.max(0,Math.ceil((result.height-y)/dy));if(!width||!height)continue;const length=1+Math.ceil(width*channels[color]*depth/8);expected+=length*height;for(let row=0;row<height;row++)rows.push(length);}if(expected>32*1024*1024)throw Error('PNG decoding exceeds its safe budget.');const decoded=inflateSync(encoded,{maxOutputLength:expected});if(decoded.length!==expected)throw Error('PNG scanlines are truncated.');let scanline=0;for(const length of rows){if(decoded[scanline]>4)throw Error('PNG filter is invalid.');scanline+=length;}return result;
 }
 if(extension==='jpg'||extension==='jpeg'){
  if(!prefix(bytes,[255,216,255])||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('JPEG structure is invalid.');let at=2;
  while(at+4<bytes.length){if(bytes[at++]!==255)throw Error('JPEG marker is invalid.');while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===0xda)break;if(marker===0xd8||marker===0xd9||marker>=0xd0&&marker<=0xd7)continue;const size=view.getUint16(at);if(size<2||at+size>bytes.length)throw Error('JPEG is truncated.');if([0xc0,0xc1,0xc2].includes(marker))return dimensions(view.getUint16(at+5),view.getUint16(at+3));at+=size;}
  throw Error('JPEG dimensions are unavailable.');
 }
 if(extension==='webp'){
  if(bytes.length<30||ascii(bytes.subarray(0,4))!=='RIFF'||ascii(bytes.subarray(8,12))!=='WEBP'||view.getUint32(4,true)+8!==bytes.length)throw Error('WebP structure is invalid.');
  const type=ascii(bytes.subarray(12,16));if(type==='VP8X')return dimensions(1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16));
  if(type==='VP8 '&&prefix(bytes,[157,1,42],23))return dimensions(view.getUint16(26,true)&16383,view.getUint16(28,true)&16383);
  if(type==='VP8L'&&bytes[20]===47){const bits=view.getUint32(21,true);return dimensions(1+(bits&16383),1+((bits>>>14)&16383));}throw Error('WebP preview format is unsupported.');
 }
 throw Error('Unsupported image format.');
}
export function docxText(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(view.getUint32(at,true)===0x06054b50){end=at;break;}
 if(end<0)throw Error('DOCX directory is missing.');const count=view.getUint16(end+10,true);let at=view.getUint32(end+16,true),total=0,text='';let document=false,contentTypes=false;
 if(count>2048)throw Error('DOCX contains too many entries.');
 for(let i=0;i<count;i++){
  if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)throw Error('DOCX directory is invalid.');
  const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),compressed=view.getUint32(at+20,true),uncompressed=view.getUint32(at+24,true),length=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),offset=view.getUint32(at+42,true);
  if(at+46+length+extra+comment>bytes.length)throw Error('DOCX directory is truncated.');const name=new TextDecoder().decode(bytes.subarray(at+46,at+46+length));at+=46+length+extra+comment;
  total+=uncompressed;if(total>32*1024*1024||uncompressed>8*1024*1024||compressed&&uncompressed/compressed>100||flags&1||![0,8].includes(method))throw Error('DOCX decompression exceeds its safe budget.');
  if(/vbaProject|\.exe$|\.js$/i.test(name)||name.includes('..')||name.startsWith('/'))throw Error('Active or unsafe DOCX content is not allowed.');
  if(name==='[Content_Types].xml')contentTypes=true;if(name!=='word/document.xml')continue;document=true;
  if(offset+30>bytes.length||view.getUint32(offset,true)!==0x04034b50)throw Error('DOCX entry is invalid.');const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);if(start+compressed>bytes.length)throw Error('DOCX is truncated.');
  const data=bytes.subarray(start,start+compressed);const expanded=method===0?data:inflateRawSync(data,{maxOutputLength:Math.min(uncompressed+1,8*1024*1024)});if(expanded.length!==uncompressed||crc32(expanded)!==view.getUint32(at-46-length-extra-comment+16,true))throw Error('DOCX entry checksum is invalid.');const xml=new TextDecoder().decode(expanded);
  if(xml.length>512000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DOCX text exceeds its safe budget.');text=xml.replace(/<\/w:p>/g,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").trim();
 }
 if(!document||!contentTypes)throw Error('ZIP is not a Word document.');return text.slice(0,128000);
}
export function inspectBytes(bytes:Uint8Array,extension:string){
 if(!bytes.length||bytes.length>INSPECTION_MAX_BYTES)throw Error('File size exceeds the inspection budget.');
 if(['png','jpg','jpeg','webp'].includes(extension))return {...inspectImage(bytes,extension),text:''};
 if(extension==='pdf'){if(!prefix(bytes,[37,80,68,70,45])||!ascii(bytes.subarray(Math.max(0,bytes.length-2048))).includes('%%EOF'))throw Error('PDF is truncated or has an invalid signature.');return {text:''};}
 if(extension==='docx')return {text:docxText(bytes)};
 if(extension==='doc'){if(bytes.length<512||!prefix(bytes,[208,207,17,224,161,177,26,225]))throw Error('DOC structure is invalid.');return {text:'',unsupported:true};}
 throw Error('This file type is unsupported.');
}
export async function boundedBytes(stream:ReadableStream<Uint8Array>,limit:number){const reader=stream.getReader();const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('File exceeds the permitted size.');chunks.push(value);}const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}}
