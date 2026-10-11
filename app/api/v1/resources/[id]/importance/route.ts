import {NextResponse} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
export const dynamic='force-dynamic';
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await optionalUser();if(!user)return NextResponse.json({error:'Sign in to manage your files.'},{status:401});
 const {id}=await params,body=await request.json().catch(()=>null);if(typeof body?.important!=='boolean')return NextResponse.json({error:'Choose whether this file is important.'},{status:400});
 const db=getD1RuntimeDatabase(),owned=await db.prepare('SELECT id FROM uploaded_resources WHERE id=?1 AND owner_user_id=?2').bind(id,user.id).first();
 if(!owned)return NextResponse.json({error:'File not found.'},{status:404});
 if(body.important)await db.prepare('INSERT OR IGNORE INTO resource_importance(resource_id,owner_user_id) SELECT id,owner_user_id FROM uploaded_resources WHERE id=?1 AND owner_user_id=?2').bind(id,user.id).run();
 else await db.prepare('DELETE FROM resource_importance WHERE resource_id=?1 AND owner_user_id=?2').bind(id,user.id).run();
 return NextResponse.json({ok:true,important:body.important},{headers:{'Cache-Control':'private, no-store'}});
}
