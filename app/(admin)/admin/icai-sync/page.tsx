import type { Metadata } from "next";
import { IcaiAdminSyncMonitor } from "@/components/icai/admin-sync-monitor";
import { requireAdminPageCapability } from "@/lib/authorization/server";
import { getIcaiAdminDashboard } from "@/lib/icai/query";
export const dynamic="force-dynamic";export const metadata:Metadata={title:"ICAI Sync Monitor | CA Progress"};
function param(value:string|string[]|undefined){return typeof value==="string"?value:null;}
export default async function IcaiSyncAdminPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const operator=await requireAdminPageCapability("icai.read");const[dashboard,params]=await Promise.all([getIcaiAdminDashboard(),searchParams]);return <IcaiAdminSyncMonitor dashboard={dashboard} role={operator.role} notice={param(params.notice)} error={param(params.error)}/>;}
