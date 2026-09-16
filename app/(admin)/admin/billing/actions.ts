"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCapability } from "@/lib/authorization/server";
import { invokeBillingService } from "@/lib/billing/service-binding";
import { createCampaignDraft, publishCampaign, retireCampaign, setCampaignAllowlist, grantCampaignAccess, type CampaignDraftInput } from "@/lib/billing/p4-admin";

const field=(form:FormData,key:string)=>String(form.get(key)??"").trim();
const numberOrNull=(value:string)=>value?Number(value):null;

export async function runBillingOperation(form:FormData){
  const actor=await requireAdminCapability("billing.manage");
  if(actor.role!=="owner"&&actor.role!=="parent_owner")throw new Error("Settlement operations require an Owner or Parent Owner.");
  const action=field(form,"action"),requestId=field(form,"requestId")||crypto.randomUUID().replaceAll("-",""),subscriptionId=field(form,"subscriptionId"),caseId=field(form,"caseId"),targetPlanId=field(form,"targetPlanId"),confirmation=field(form,"confirmation"),reason=field(form,"reason");
  const response=await invokeBillingService({path:"/admin/action",userId:actor.user.id,actorRole:actor.role,body:JSON.stringify({action,requestId,subscriptionId:subscriptionId||undefined,caseId:caseId||undefined,targetPlanId:targetPlanId||undefined,confirmation,reason}),contentType:"application/json"});
  const payload=await response.json().catch(()=>null) as {error?:string;result?:unknown}|null;
  if(!response.ok)throw new Error(payload?.error||"Billing operation failed.");
  revalidatePath("/admin/billing");
}

export async function createBillingCampaign(form:FormData){
  const actor=await requireAdminCapability("billing.manage");
  if(actor.role!=="owner"&&actor.role!=="parent_owner")throw new Error("Campaign management requires an Owner or Parent Owner.");
  const input:CampaignDraftInput={
    campaignId:field(form,"campaignId")||undefined,campaignKey:field(form,"campaignKey"),name:field(form,"name"),description:field(form,"description"),
    campaignType:field(form,"campaignType") as CampaignDraftInput["campaignType"],discountKind:(field(form,"discountKind")||"none") as CampaignDraftInput["discountKind"],
    discountValue:Number(field(form,"discountValue")||0),providerOfferId:field(form,"providerOfferId")||null,promoCode:field(form,"promoCode")||null,
    targetPlanId:field(form,"targetPlanId")||null,attemptKey:field(form,"attemptKey")||null,startsAt:field(form,"startsAt"),endsAt:field(form,"endsAt"),
    claimStartsAt:field(form,"claimStartsAt"),claimEndsAt:field(form,"claimEndsAt"),maxRedemptions:numberOrNull(field(form,"maxRedemptions")),
    perUserLimit:Number(field(form,"perUserLimit")||1),firstNLimit:numberOrNull(field(form,"firstNLimit")),freeAccessDays:Number(field(form,"freeAccessDays")||0),
    discountCycles:Number(field(form,"discountCycles")||1),requireAllowlist:field(form,"requireAllowlist")==="on",priority:Number(field(form,"priority")||100),changeReason:field(form,"reason")
  };
  await createCampaignDraft(input,{userId:actor.user.id,role:actor.role,traceId:crypto.randomUUID()});
  revalidatePath("/admin/billing");
}

export async function publishBillingCampaign(form:FormData){
  const actor=await requireAdminCapability("billing.manage");
  await publishCampaign(field(form,"versionId"),{userId:actor.user.id,role:actor.role,traceId:crypto.randomUUID()},field(form,"reason"));
  revalidatePath("/admin/billing");
}

export async function updateCampaignAllowlist(form:FormData){
  const actor=await requireAdminCapability("billing.manage");
  await setCampaignAllowlist(field(form,"versionId"),field(form,"userId"),field(form,"allowed")==="1",{userId:actor.user.id,role:actor.role,traceId:crypto.randomUUID()},field(form,"reason"));
  revalidatePath("/admin/billing");
}

export async function grantBillingCampaignAccess(form:FormData){
  const actor=await requireAdminCapability("billing.manage");
  await grantCampaignAccess({versionId:field(form,"versionId"),userId:field(form,"userId"),reason:field(form,"reason")},{userId:actor.user.id,role:actor.role,traceId:crypto.randomUUID()});
  revalidatePath("/admin/billing");
}

export async function retireBillingCampaign(form:FormData){
  const actor=await requireAdminCapability("billing.manage");
  await retireCampaign(field(form,"versionId"),{userId:actor.user.id,role:actor.role,traceId:crypto.randomUUID()},field(form,"reason"));
  revalidatePath("/admin/billing");
}
