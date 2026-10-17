/** Repair missing owner thumbnails from an already authorized, decoded image. */
const checked=new Map<string,number>(),inProgress=new Set<string>();
let active=0;const waiting:(()=>Promise<void>)[]=[];
function drain(){while(active<2&&waiting.length){const work=waiting.shift()!;active++;void work().catch(()=>undefined).finally(()=>{active--;drain();});}}
export function repairImageThumbnail(image:HTMLImageElement,previewUrl:string,onReady?:()=>void,revision=''){
 if(waiting.length>=96)return;const url=new URL(previewUrl,location.href);
 if(url.origin!==location.origin||!/^\/api\/(?:v1\/)?resources\/[^/]+\/preview$/.test(url.pathname))return;
 const key=revision||url.href;if(inProgress.has(key)||Date.now()-(checked.get(key)??0)<300000)return;inProgress.add(key);
 const complete=()=>{checked.delete(key);checked.set(key,Date.now());while(checked.size>128)checked.delete(checked.keys().next().value!);};
 waiting.push(async()=>{try{
  if(!image.isConnected||!image.naturalWidth||image.naturalWidth*image.naturalHeight>24000000)return;
  const metadataUrl=new URL(url);metadataUrl.searchParams.set('text','1');const response=await fetch(metadataUrl,{cache:'no-store'});if(!response.ok)return;
  const metadata=await response.json();if(metadata.hasThumbnail&&metadata.thumbnailQuality==='high'&&metadata.state==='ready'){complete();return;}if(metadata.hasThumbnail&&metadata.thumbnailQuality==='high'||metadata.state!=='ready'||typeof metadata.sourceHash!=='string'||!/^[0-9a-f]{64}$/.test(metadata.sourceHash)||!image.isConnected)return;
  let bitmap:ImageBitmap|undefined;
  if(metadata.hasThumbnail){const original=new URL(url);original.searchParams.set('source','1');const response=await fetch(original,{cache:'no-store'});if(!response.ok)return;bitmap=await createImageBitmap(await response.blob());}
  const source=bitmap??image,width=bitmap?.width??image.naturalWidth,height=bitmap?.height??image.naturalHeight;
  if(width*height>24000000){bitmap?.close();return;}
  const scale=Math.min(1,768/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d');if(!context)return;context.imageSmoothingQuality='high';context.drawImage(source,0,0,canvas.width,canvas.height);
  let blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));if(blob&&blob.size>180000){canvas.width=Math.max(1,Math.round(canvas.width/2));canvas.height=Math.max(1,Math.round(canvas.height/2));context.drawImage(source,0,0,canvas.width,canvas.height);blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));}bitmap?.close();if(!blob||blob.size>180000||!image.isConnected)return;
  const saved=await fetch(url,{method:'POST',headers:{'Content-Type':'image/png','X-Source-SHA256':metadata.sourceHash},body:blob});if(saved.ok){complete();if(image.isConnected)onReady?.();}
 }finally{inProgress.delete(key);}});drain();
}
