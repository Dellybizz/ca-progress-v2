import {nativeCorsHeaders,nativeOptions} from '@/lib/auth/native-cors';
import {NextResponse} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {getHotD1Database} from '@/lib/data/d1/runtime';
import {authorizedPreview} from '@/lib/resources/preview-access';
import {getResourceR2Bucket} from '@/lib/resources/r2';
import {boundedBytes,inspectImage} from '@/lib/resources/inspection';
export const dynamic='force-dynamic';export const runtime='nodejs';
export const OPTIONS=(request:Request)=>nativeOptions(request);
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await optionalUser();if(!user)return NextResponse.json({error:'Authentication required.'},{status:401,headers});const {id}=await params;const allowed=await authorizedPreview(user.id,id);if(!allowed)return NextResponse.json({error:'File not found.'},{status:404,headers});
 const inspection=allowed.inspection;if(new URL(request.url).searchParams.get('text')==='1')return NextResponse.json({state:inspection?.state??'queued',text:['ready','unsupported'].includes(inspection?.state??'')?inspection?.text_content??'':'',message:inspection?.state==='unsupported'?'A visual preview is unavailable for this file.':inspection?.state==='quarantined'?'This file did not pass inspection.':undefined},{headers});
 if(!inspection||inspection.state!=='ready'||!inspection.thumbnail_key)return new Response(null,{status:404,headers});const object=await getResourceR2Bucket().get(inspection.thumbnail_key);if(!object)return new Response(null,{status:404,headers});return new Response(object.body,{headers:{...headers,'Content-Type':inspection.thumbnail_mime??'image/png','Content-Length':String(object.size)}});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await optionalUser();if(!user)return NextResponse.json({error:'Authentication required.'},{status:401,headers});const responseHeaders={...headers,...nativeCorsHeaders(request)};const {id}=await params;const allowed=await authorizedPreview(user.id,id);if(!allowed||allowed.row.owner_user_id!==user.id||!allowed.inspection||!['queued','processing','ready'].includes(allowed.inspection.state))return NextResponse.json({error:'File not found or preview unavailable.'},{status:404,headers});
 if(request.headers.get('X-Source-SHA256')!==allowed.inspection.content_sha256)return NextResponse.json({error:'Preview source changed.'},{status:409,headers});
 if(!['image/png','application/json'].includes(request.headers.get('Content-Type')??'')||!request.body)return NextResponse.json({error:'A PNG thumbnail is required.'},{status:400,headers});
 try{let bytes:Uint8Array;if(request.headers.get('Content-Type')==='application/json'){const payload=JSON.parse(new TextDecoder().decode(await boundedBytes(request.body,250000))) as {base64?:string};if(typeof payload.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(payload.base64))throw Error('Invalid thumbnail encoding.');bytes=Uint8Array.from(atob(payload.base64),c=>c.charCodeAt(0));if(bytes.length>180000)throw Error('Thumbnail exceeds its byte limit.');}else bytes=await boundedBytes(request.body,180000);const size=inspectImage(bytes,'png');if(size.width>384||size.height>384)throw Error('Thumbnail dimensions exceed the limit.');
  const key=`derivatives/${user.id}/${allowed.sourceId}/${allowed.inspection.content_sha256}/image.png`;await getResourceR2Bucket().put(key,bytes,{httpMetadata:{contentType:'image/png'},customMetadata:{owner:user.id}});
  await getHotD1Database().prepare("UPDATE resource_inspections SET thumbnail_key=?1,thumbnail_mime='image/png',thumbnail_bytes=?2,updated_at=CURRENT_TIMESTAMP WHERE resource_id=?3 AND content_sha256=?4 AND state IN ('queued','processing','ready')").bind(key,bytes.length,allowed.sourceId,allowed.inspection.content_sha256).run();return NextResponse.json({saved:true},{headers:responseHeaders});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Thumbnail failed.'},{status:400,headers});}
}
