"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminCapability } from "@/lib/authorization/server";
import { changeManualSubscriptionExpiry,grantManualSubscriptionAccess,revokeManualSubscriptionAccess } from "@/lib/admin/subscription-access";
const v=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const actor=async()=>{const current=await requireAdminCapability("billing.manage");return{userId:current.user.id,role:current.role};};
const done=(userId:string,notice:string)=>{const path=`/admin/users/${encodeURIComponent(userId)}/subscription-access`;revalidatePath(path);revalidatePath(`/admin/users/${encodeURIComponent(userId)}`);redirect(`${path}?notice=${encodeURIComponent(notice)}`);};
export async function grantManualAccessAction(data:FormData){const userId=v(data,"userId");await grantManualSubscriptionAccess({userId,planId:v(data,"planId"),startsAt:v(data,"startsAt"),endsAt:v(data,"endsAt"),reason:v(data,"reason"),idempotencyKey:v(data,"idempotencyKey"),confirmed:data.get("confirmed")==="on",actor:await actor()});done(userId,"Manual access granted");}
export async function changeManualExpiryAction(data:FormData){const userId=v(data,"userId");await changeManualSubscriptionExpiry({grantId:v(data,"grantId"),endsAt:v(data,"endsAt"),reason:v(data,"reason"),confirmed:data.get("confirmed")==="on",actor:await actor()});done(userId,"Access expiry updated");}
export async function revokeManualAccessAction(data:FormData){const userId=v(data,"userId");await revokeManualSubscriptionAccess({grantId:v(data,"grantId"),reason:v(data,"reason"),confirmed:data.get("confirmed")==="on",actor:await actor()});done(userId,"Manual access revoked");}
