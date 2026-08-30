import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { IcaiAdminSyncMonitor } from "@/components/icai/admin-sync-monitor";
import { getAdminOperator } from "@/lib/authorization/server";
import { getIcaiAdminDashboard } from "@/lib/icai/query";
export const dynamic="force-dynamic";export const metadata:Metadata={title:"ICAI Sync Monitor | CA Progress"};
function param(value:string|string[]|undefined){return typeof value==="string"?value:null;}
export default async function IcaiSyncAdminPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const operator=await getAdminOperator();if(!operator.allowed){return <div className="icai-page"><section className="icai-permission-state"><span><Icon name="shield" size={28}/></span><Badge tone="danger">Access denied</Badge><h1>ICAI Sync Monitor is restricted</h1><p>Only a V2 admin, owner or parent owner can view private sync runs, parser errors and the high-impact review queue.</p></section></div>;}const[dashboard,params]=await Promise.all([getIcaiAdminDashboard(),searchParams]);return <IcaiAdminSyncMonitor dashboard={dashboard} role={operator.role} notice={param(params.notice)} error={param(params.error)}/>;}
