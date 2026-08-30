import type { Metadata } from "next";
import { IcaiResourceBrowser } from "@/components/icai/resource-browser";
import { getIcaiPublicCatalog } from "@/lib/icai/query";
export const dynamic="force-dynamic"; export const metadata:Metadata={title:"ICAI Resources | CA Progress"};
function param(value:string|string[]|undefined){return typeof value==="string"?value:null;}
export default async function IcaiResourcesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;const catalog=await getIcaiPublicCatalog({level:param(params.level),attempt:param(params.attempt),subject:param(params.subject),type:param(params.type)});return <IcaiResourceBrowser catalog={catalog}/>;}
