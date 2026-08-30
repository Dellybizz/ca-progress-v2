import type { Metadata } from "next";
import { IcaiUpdatesFeed } from "@/components/icai/updates-feed";
import { getIcaiPublicCatalog } from "@/lib/icai/query";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
export const dynamic="force-dynamic"; export const metadata:Metadata={title:"ICAI Updates | CA Progress"};
function param(value:string|string[]|undefined){return typeof value==="string"?value:null;}
export default async function IcaiUpdatesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;const user=await optionalUser();const profile=user?await getProfileForUser(user.id):null;const catalog=await getIcaiPublicCatalog({level:param(params.level),attempt:param(params.attempt),type:param(params.type)});return <IcaiUpdatesFeed catalog={catalog} viewerAttemptKey={profile?.attempt_key??null}/>;}
