import {NextResponse} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {invokeBillingService} from '@/lib/billing/service-binding';
import {nativeCommerceMutationRejection} from '@/lib/mobile/commerce-server';
export const dynamic='force-dynamic';
export async function POST(request:Request){const rejection=nativeCommerceMutationRejection(request);if(rejection)return rejection;const user=await optionalUser();if(!user)return NextResponse.json({error:'Sign in to recover checkout.'},{status:401,headers:{'cache-control':'private, no-store'}});const raw=await request.text();if(raw.length>4096)return NextResponse.json({error:'Request is too large.'},{status:413});return invokeBillingService({path:'/checkout/recover',userId:user.id,body:raw,contentType:'application/json'});}
