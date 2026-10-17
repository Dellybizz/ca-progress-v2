import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { invokeBillingService } from "@/lib/billing/service-binding";
import { nativeCommerceMutationRejection } from "@/lib/mobile/commerce-server";

export const dynamic = "force-dynamic";
export async function POST(request:Request){
  const nativeRejection=nativeCommerceMutationRejection(request);if(nativeRejection)return nativeRejection;
  const user=await optionalUser();
  if(!user)return NextResponse.json({error:"Sign in to verify this subscription."},{status:401,headers:{"Cache-Control":"private, no-store"}});
  const raw=await request.text();
  if(raw.length>4096)return NextResponse.json({error:"Verification request is too large."},{status:413});
  return invokeBillingService({path:"/verify-subscription",userId:user.id,body:raw,contentType:"application/json"});
}
