import {setStorageImportance} from '@/lib/billing/storage-cleanup.mjs';
import {NextResponse} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
export const dynamic='force-dynamic';
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await optionalUser();if(!user)return NextResponse.json({error:'Sign in to manage your files.'},{status:401});
 const {id}=await params,body=await request.json().catch(()=>null);if(typeof body?.important!=='boolean')return NextResponse.json({error:'Choose whether this file is important.'},{status:400});
 const ok=await setStorageImportance(getD1RuntimeDatabase(),'resource',id,user.id,body.important);
 if(!ok)return NextResponse.json({error:'File not found or cleanup is underway.'},{status:404});
 return NextResponse.json({ok:true,important:body.important},{headers:{'Cache-Control':'private, no-store'}});
}
