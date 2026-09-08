import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getIcaiSyncConfig } from "@/lib/env";
import type { IcaiSyncSummary } from "./types";
import { invalidateSharedPublicCache } from "@/lib/cache/public";

type IcaiSyncService = { fetch(request: Request): Promise<Response> };
export type IcaiSyncContinuationStart = { runId: string; sourceIds: string[] };
export type IcaiSyncContinuationSourceResult = { runId:string;sourceId:string;status:"succeeded"|"failed"|"skipped"|"cancelled";requestIntervalSeconds:number;alreadyComplete:boolean };
type SyncPayload<T = unknown> = { ok?: boolean; result?: T; summary?: IcaiSyncSummary; error?: string };

function getService():IcaiSyncService{try{const{env}=getCloudflareContext();const service=(env as unknown as Record<string,unknown>).ICAI_SYNC_SERVICE as IcaiSyncService|undefined;if(service&&typeof service.fetch==="function")return service;}catch{}throw new Error("ICAI sync service binding is unavailable. Use the Cloudflare multi-Worker runtime for sync operations.");}
async function request<T>(path:string,body:Record<string,unknown>):Promise<SyncPayload<T>>{const sync=getIcaiSyncConfig();if(!sync.enabled)throw new Error("ICAI synchronization is disabled for this environment.");const response=await getService().fetch(new Request(`https://icai-sync.internal${path}`,{method:"POST",headers:{"content-type":"application/json","x-ca-progress-internal":"ca-progress-v2-web","x-ca-progress-icai-user-agent":sync.userAgent,"x-ca-progress-icai-enabled":String(sync.enabled)},body:JSON.stringify(body)}));const text=await response.text();let payload:SyncPayload<T>={};if(text){try{payload=JSON.parse(text) as SyncPayload<T>;}catch{payload={};}}if(!response.ok||!payload.ok)throw new Error(payload.error||`ICAI sync service failed (${response.status}).`);return payload;}

export async function runIcaiSync({trigger,requestedBy=null}:{trigger:"cron"|"manual"|"test";requestedBy?:string|null}):Promise<IcaiSyncSummary>{const payload=await request("/run",{trigger,requestedBy});if(!payload.summary)throw new Error("ICAI sync service returned no summary.");await invalidateSharedPublicCache(["icai"]);return payload.summary;}
export async function startIcaiSyncContinuation({trigger,requestedBy=null,orchestrationKey}:{trigger:"cron"|"manual"|"test";requestedBy?:string|null;orchestrationKey:string}):Promise<IcaiSyncContinuationStart>{const payload=await request<IcaiSyncContinuationStart>("/start",{trigger,requestedBy,orchestrationKey});if(!payload.result)throw new Error("ICAI sync service returned no continuation start result.");return payload.result;}
export async function runIcaiSyncSource({runId,sourceId}:{runId:string;sourceId:string}):Promise<IcaiSyncContinuationSourceResult>{const payload=await request<IcaiSyncContinuationSourceResult>("/source",{runId,sourceId});if(!payload.result)throw new Error("ICAI sync service returned no source result.");return payload.result;}
export async function finalizeIcaiSyncContinuation({runId}:{runId:string}):Promise<IcaiSyncSummary>{const payload=await request("/finalize",{runId});if(!payload.summary)throw new Error("ICAI sync service returned no continuation summary.");await invalidateSharedPublicCache(["icai"]);return payload.summary;}
