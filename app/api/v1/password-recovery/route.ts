import {NextResponse,type NextRequest} from 'next/server';
import {assertSameOriginMutation} from '@/lib/auth/csrf';
import {completePasswordRecovery,PasswordRecoveryError} from '@/lib/auth/password-recovery';
import {PasswordAuthError} from '@/lib/auth/password';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:NextRequest){try{assertSameOriginMutation(request);}catch{return json({error:'Invalid request origin.'},403);}if(Number(request.headers.get('content-length')||0)>2048)return json({error:'Request too large.'},413);const input=await request.json().catch(()=>null) as {password?:unknown}|null;if(typeof input?.password!=='string'||input.password.length<8||input.password.length>128)return json({error:'Use a password of 8–128 characters.'},400);try{return json(await completePasswordRecovery(input.password));}catch(error){if(error instanceof PasswordRecoveryError)return json({error:error.message},error.status);if(error instanceof PasswordAuthError)return json({error:error.message},400);return json({error:'Password recovery is temporarily unavailable. Please try again.'},503);}}
