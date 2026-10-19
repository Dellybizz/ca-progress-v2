import {NextResponse} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {invokeBillingService} from '@/lib/billing/service-binding';
import {nativeCommerceMutationRejection} from '@/lib/mobile/commerce-server';
export const dynamic='force-dynamic';
export async function GET(){const user=await optionalUser();if(!user)return NextResponse.json({error:'Sign in to view your upgrade.'},{status:401});return invokeBillingService({path:'/upgrade',method:'GET',userId:user.id});}
export async function POST(request:Request){
 const rejection=nativeCommerceMutationRejection(request);if(rejection)return rejection;
 const user=await optionalUser();if(!user)return NextResponse.json({error:'Sign in to upgrade.'},{status:401});
 const raw=await request.text();if(raw.length>8192)return NextResponse.json({error:'Request is too large.'},{status:413});
 return invokeBillingService({path:'/upgrade',userId:user.id,body:raw,contentType:'application/json'});
}
