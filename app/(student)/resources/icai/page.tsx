import type { Metadata } from "next";
import { IcaiResourceBrowser } from "@/components/icai/resource-browser";
import { getIcaiPublicCatalog } from "@/lib/icai/query";
import { getStudentContext } from "@/lib/academic/student-context";
export const dynamic="force-dynamic"; export const metadata:Metadata={title:"ICAI Resources | CA Progress"};
function param(value:string|string[]|undefined){return typeof value==="string"?value:null;}
export default async function IcaiResourcesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const [params,context]=await Promise.all([searchParams,getStudentContext()]);const selection=context.mode==="ready"?context.selection:null;const requestedSubject=param(params.subject);const catalog=await getIcaiPublicCatalog({level:selection?.level??param(params.level),attempt:selection?.attemptKey??param(params.attempt),subject:selection&&requestedSubject&&!context.subjectIds.includes(requestedSubject)?"__not_applicable__":requestedSubject,type:param(params.type)});return <IcaiResourceBrowser catalog={catalog}/>;}
