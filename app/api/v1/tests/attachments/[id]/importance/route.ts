import {NextResponse,type NextRequest} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
import {setStorageImportance} from '@/lib/billing/storage-cleanup.mjs';
import {nativeCorsHeaders,nativeOptions} from '@/lib/auth/native-cors';
export const dynamic='force-dynamic';
export const OPTIONS=(request:NextRequest)=>nativeOptions(request);
const reply=(request:NextRequest,data:unknown,status=200)=>NextResponse.json(data,{status,headers:{...nativeCorsHeaders(request),'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await optionalUser();if(!user)return reply(request,{error:'Sign in to manage your files.'},401);
 const {id}=await params;const row=await getD1RuntimeDatabase().prepare('SELECT a.id,EXISTS(SELECT 1 FROM test_attachment_importance i WHERE i.attachment_id=a.id AND i.user_id=a.user_id) important FROM test_attempt_attachments a WHERE a.id=?1 AND a.user_id=?2').bind(id,user.id).first<{id:string;important:number}>();
 return row?reply(request,{important:Boolean(row.important)}):reply(request,{error:'Attachment not found.'},404);
}
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await optionalUser();if(!user)return reply(request,{error:'Sign in to manage your files.'},401);
 const {id}=await params,body=await request.json().catch(()=>null);if(typeof body?.important!=='boolean')return reply(request,{error:'Choose whether this file is important.'},400);
 const ok=await setStorageImportance(getD1RuntimeDatabase(),'test_attachment',id,user.id,body.important);
 return ok?reply(request,{ok:true,important:body.important}):reply(request,{error:'Attachment not found or cleanup is underway.'},404);
}
