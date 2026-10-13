import {NextResponse,type NextRequest} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
import {cleanupStatus} from '@/lib/billing/storage-cleanup.mjs';
import {nativeCorsHeaders,nativeOptions} from '@/lib/auth/native-cors';
export const dynamic='force-dynamic';
export const OPTIONS=(request:NextRequest)=>nativeOptions(request);
export async function GET(request:NextRequest){
 const user=await optionalUser();const headers={...nativeCorsHeaders(request),'Cache-Control':'private, no-store'};
 if(!user)return NextResponse.json({error:'Sign in to view your storage.'},{status:401,headers});
 return NextResponse.json({storageCleanup:await cleanupStatus(getD1RuntimeDatabase(),user.id)},{headers});
}
