/** Authenticated previews stay in bounded, short-lived tab memory, never public storage. */
const cached=new Map<string,{url:string;at:number;bytes:number}>(),pending=new Map<string,Promise<string>>();
const waiting:(()=>void)[]=[];let active=0,total=0;
function drain(){while(active<4&&waiting.length){active++;waiting.shift()!();}}
export function previewMemoryKey(scope:string,url:string){return JSON.stringify([scope,url]);}
export function cachedPreview(key:string){const item=cached.get(key);if(!item)return;cached.delete(key);cached.set(key,item);return item.url;}
export function loadPreview(key:string,url:string,force=false):Promise<string>{
 const hit=cachedPreview(key),fresh=Date.now()-(cached.get(key)?.at??0)<300000;if(hit&&fresh&&!force)return Promise.resolve(hit);const work=pending.get(key);if(work)return work;
 const request=new Promise<string>((resolve,reject)=>{
  waiting.push(()=>{void fetch(url,{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('Preview unavailable');const blob=await response.blob();if(!/^image\/(png|jpeg|webp|svg\+xml|gif|avif)$/.test(blob.type)||blob.size>10*1024*1024)throw Error('Invalid preview');const object=URL.createObjectURL(blob);const old=cached.get(key);if(old){URL.revokeObjectURL(old.url);total-=old.bytes;}cached.delete(key);cached.set(key,{url:object,at:Date.now(),bytes:blob.size});total+=blob.size;while(cached.size>128||total>32*1024*1024){const first=cached.keys().next().value!;const item=cached.get(first)!;cached.delete(first);total-=item.bytes;URL.revokeObjectURL(item.url);}resolve(object);}).catch(reject).finally(()=>{active--;drain();});});drain();
 }).finally(()=>pending.delete(key));pending.set(key,request);return request;
}
