import { NextResponse } from "next/server";
import { listPublishedPricingOffers } from "@/lib/billing/commercial-policy";
import { paymentMethod, quoteForMethod } from "@/lib/billing/payment-quote.mjs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const headers={"Cache-Control":"private, no-store"};
  try{
    const method=paymentMethod(new URL(request.url).searchParams.get("method")??"upi");
    const offers=await listPublishedPricingOffers();
    return NextResponse.json({quotes:offers.map(offer=>({planId:offer.planId,tierKey:offer.tierKey,billingCycle:offer.billingCycle,policyVersionId:offer.policyVersionId,currency:offer.currency,checkoutEnabled:offer.checkoutEnabled,...quoteForMethod({recurring:offer.recurringPriceSubunits,intro:offer.introPriceSubunits,eligible:offer.introEligible,trialDays:offer.trialDays},method),checkoutReady:offer.checkoutReady&&(method!=="upi"||!offer.introEligible||offer.introOfferReady)}))},{headers});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Pricing is unavailable."},{status:400,headers});}
}
