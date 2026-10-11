import {NextResponse} from 'next/server';
import {optionalUser} from '@/lib/auth/server';
import {getD1RuntimeDatabase} from '@/lib/data/d1/client';
import {listPublishedPricingOffers} from '@/lib/billing/commercial-policy';
import {saveUpgradeQuote,saveIntroQuote} from '@/lib/billing/upgrade-engine.mjs';
import {paymentMethod} from '@/lib/billing/payment-quote.mjs';
import {CheckoutError} from '@/lib/billing/checkout-engine.mjs';
import {nativeCommerceMutationRejection} from '@/lib/mobile/commerce-server';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){
 const rejection=nativeCommerceMutationRejection(request);if(rejection)return rejection;
 const user=await optionalUser();if(!user)return NextResponse.json({error:'Sign in to review your upgrade.'},{status:401,headers});
 const raw=await request.text();if(raw.length>4096)return NextResponse.json({error:'Request is too large.'},{status:413,headers});
 let input:{planId?:unknown;paymentMethod?:unknown;purchaseKind?:unknown}|null;try{input=JSON.parse(raw||'null');}catch{return NextResponse.json({error:'Invalid upgrade request.'},{status:400,headers});}
 if(typeof input?.planId!=='string')return NextResponse.json({error:'Choose a plan.'},{status:400,headers});
 try{
  const target=(await listPublishedPricingOffers()).find(p=>p.planId===input.planId&&(p.tierKey==='pro'||(input.purchaseKind==='intro'&&p.tierKey==='basic'))&&p.billingCycle==='monthly'&&p.currency==='INR'&&p.checkoutEnabled);
  if(!target)return NextResponse.json({error:'This upgrade is unavailable.'},{status:409,headers});
  return NextResponse.json(await (input.purchaseKind==='intro'?saveIntroQuote:saveUpgradeQuote)(getD1RuntimeDatabase(),user.id,target,paymentMethod(input.paymentMethod??'upi')),{headers});
 }catch(error){return NextResponse.json({error:error instanceof CheckoutError?error.message:'Your upgrade review is temporarily unavailable. Please try again.'},{status:error instanceof CheckoutError?error.status:503,headers});}
}
