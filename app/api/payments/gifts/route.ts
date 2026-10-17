import {NextResponse} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {invokeBillingService} from '@/lib/billing/service-binding';
export const dynamic='force-dynamic';
export async function GET(){const user=await optionalUser();if(!user)return NextResponse.json({error:'Sign in to manage gifts.'},{status:401});return invokeBillingService({path:'/gifts',method:'GET',userId:user.id});}
export async function POST(request:Request){const user=await optionalUser();if(!user)return NextResponse.json({error:'Sign in to manage gifts.'},{status:401});const raw=await request.text();if(raw.length>4096)return NextResponse.json({error:'Request too large.'},{status:413});let body;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid gift request.'},{status:400});}const paths={offer:'/gifts/offer',accept:'/gifts/accept',cancel:'/gifts/cancel'} as const;const path=paths[body.action as keyof typeof paths];if(!path)return NextResponse.json({error:'Choose a supported gift action.'},{status:400});return invokeBillingService({path,userId:user.id,body:raw,contentType:'application/json'});}
