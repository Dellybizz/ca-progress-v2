"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminCapability } from "@/lib/authorization/server";
import { controlArea, publishControlVersion, saveControlDraft } from "@/lib/admin/control-centre";

const value=(data:FormData,key:string)=>String(data.get(key)??"").trim();
export async function saveDraftAction(data:FormData){
  const area=controlArea(value(data,"area")); if(!area) throw new Error("Choose a valid area.");
  const actor=await requireAdminCapability(area.capability);
  await saveControlDraft({area:area.key,documentKey:value(data,"documentKey"),title:value(data,"title"),config:value(data,"config"),reason:value(data,"reason"),idempotencyKey:value(data,"idempotencyKey"),actor:{userId:actor.user.id,role:actor.role}});
  revalidatePath("/admin/control"); redirect("/admin/control?notice=Draft+saved");
}
export async function publishVersionAction(data:FormData){
  const area=controlArea(value(data,"area")); if(!area) throw new Error("Choose a valid area.");
  const actor=await requireAdminCapability(area.capability);
  await publishControlVersion({id:value(data,"id"),reason:value(data,"reason"),idempotencyKey:value(data,"idempotencyKey"),actor:{userId:actor.user.id,role:actor.role}});
  revalidatePath("/admin/control"); redirect("/admin/control?notice=Version+published");
}
