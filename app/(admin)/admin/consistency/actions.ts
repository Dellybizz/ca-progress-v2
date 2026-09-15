"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminCapability } from "@/lib/authorization/server";
import { acknowledgeFinding, applySafeRepair, runConsistencyScan } from "@/lib/consistency/scanner";
const value=(d:FormData,k:string)=>String(d.get(k)??"").trim();
const destination=(message:string,error=false)=>redirect(`/admin/consistency?${error?'error':'notice'}=${encodeURIComponent(message)}`);
export async function runScanAction(){try{const a=await requireAdminCapability("system.configure");const result=await runConsistencyScan({trigger:"manual",actorUserId:a.user.id});revalidatePath("/admin/consistency");destination(`Scan complete: ${result.findings} findings, ${result.critical} critical.`);}catch(e){destination(e instanceof Error?e.message:"Scan failed.",true);}}
export async function acknowledgeFindingAction(d:FormData){try{const a=await requireAdminCapability("system.configure");await acknowledgeFinding({id:value(d,"id"),note:value(d,"note"),actor:{userId:a.user.id,role:a.role}});revalidatePath("/admin/consistency");destination("Finding acknowledged.");}catch(e){destination(e instanceof Error?e.message:"Acknowledgement failed.",true);}}
export async function safeRepairAction(d:FormData){try{const a=await requireAdminCapability("system.recovery");await applySafeRepair({id:value(d,"id"),idempotencyKey:value(d,"idempotencyKey"),actor:{userId:a.user.id,role:a.role}});revalidatePath("/admin/consistency");destination("Safe repair completed.");}catch(e){destination(e instanceof Error?e.message:"Repair failed.",true);}}
