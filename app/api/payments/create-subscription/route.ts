import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { invokeBillingService } from "@/lib/billing/service-binding";
import { nativeCommerceMutationRejection } from "@/lib/mobile/commerce-server";

export const dynamic = "force-dynamic";
export async function POST(request:Request){
  const nativeRejection=nativeCommerceMutationRejection(request);if(nativeRejection)return nativeRejection;
  const authStarted=performance.now();
  const user=await optionalUser();
  const authDuration=performance.now()-authStarted;
  if(!user)return NextResponse.json({error:"Sign in to start a subscription."},{status:401,headers:{"Cache-Control":"private, no-store"}});
  const raw=await request.text();
  if(raw.length>4096)return NextResponse.json({error:"Subscription request is too large."},{status:413});
  const response=await invokeBillingService({path:"/create-subscription",userId:user.id,body:raw,contentType:"application/json"});
  response.headers.append("server-timing",`checkout_auth;dur=${authDuration.toFixed(1)}`);
  return response;
}
