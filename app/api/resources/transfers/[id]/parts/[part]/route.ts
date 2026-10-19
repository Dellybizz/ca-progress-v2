import {nativeCorsHeaders,nativeOptions} from '@/lib/auth/native-cors';
import {boundedBytes} from '@/lib/resources/inspection';
import {NextResponse} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {TransferError,uploadTransferPart} from '@/lib/resources/transfers';
export const dynamic='force-dynamic';export const runtime='nodejs';
export const OPTIONS=(request:Request)=>nativeOptions(request);
export async function PUT(request:Request,{params}:{params:Promise<{id:string;part:string}>}){
 const user=await optionalUser();const headers={'Cache-Control':'private, no-store',...nativeCorsHeaders(request)};if(!user)return NextResponse.json({error:'Authentication required.'},{status:401,headers});
 if(request.headers.get('X-CA-Owner')!==user.id)return NextResponse.json({error:'Your account changed.'},{status:409,headers});
 if(!request.body)return NextResponse.json({error:'Part bytes are required.'},{status:400,headers});
 const {id,part}=await params;try{let source=request.body;if(request.headers.get('Content-Type')?.includes('application/json')){const encoded=await boundedBytes(source,7*1024*1024);const payload=JSON.parse(new TextDecoder().decode(encoded)) as {base64?:string};if(typeof payload.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(payload.base64))throw new TransferError('Invalid part encoding.',400);const raw=atob(payload.base64);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));source=new Blob([bytes]).stream();}return NextResponse.json(await uploadTransferPart(user.id,id,Number(part),request.headers.get('X-Part-SHA256')??'',source),{headers});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Part upload failed.'},{status:error instanceof TransferError?error.status:503,headers});}
}
