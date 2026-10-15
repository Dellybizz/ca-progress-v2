/** Repair missing owner thumbnails from an already authorized, decoded image. */
let active=0;const waiting:(()=>Promise<void>)[]=[];
function drain(){while(active<2&&waiting.length){const work=waiting.shift()!;active++;void work().catch(()=>undefined).finally(()=>{active--;drain();});}}
export function repairImageThumbnail(image:HTMLImageElement,previewUrl:string){
 if(waiting.length>=96)return;const url=new URL(previewUrl,location.href);
 if(url.origin!==location.origin||!/^\/api\/(?:v1\/)?resources\/[^/]+\/preview$/.test(url.pathname))return;
 waiting.push(async()=>{
  if(!image.isConnected||!image.naturalWidth||image.naturalWidth*image.naturalHeight>24000000)return;
  const metadataUrl=new URL(url);metadataUrl.searchParams.set('text','1');const response=await fetch(metadataUrl,{cache:'no-store'});if(!response.ok)return;
  const metadata=await response.json();if(metadata.hasThumbnail||metadata.state!=='ready'||typeof metadata.sourceHash!=='string'||!/^[0-9a-f]{64}$/.test(metadata.sourceHash)||!image.isConnected)return;
  const scale=Math.min(1,384/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext('2d');if(!context)return;context.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.size>180000||!image.isConnected)return;
  await fetch(url,{method:'POST',headers:{'Content-Type':'image/png','X-Source-SHA256':metadata.sourceHash},body:blob});
 });drain();
}
