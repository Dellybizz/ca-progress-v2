import {NextResponse} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {invokeBillingService} from '@/lib/billing/service-binding';
export const dynamic='force-dynamic';
export async function GET(request:Request){const user=await optionalUser();if(!user)return NextResponse.json({error:'Sign in to view checkout.'},{status:401,headers:{'cache-control':'private, no-store'}});const id=new URL(request.url).searchParams.get('attemptId');if(id&&id.length>100)return NextResponse.json({error:'Invalid checkout identifier.'},{status:400});return invokeBillingService({path:'/checkout/status',method:'GET',userId:user.id,query:id?`?attemptId=${encodeURIComponent(id)}`:undefined});}
