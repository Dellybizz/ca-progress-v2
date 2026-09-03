import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getIcaiSyncConfig } from "@/lib/env";
import type { IcaiSyncSummary } from "./types";
import { invalidateSharedPublicCache } from "@/lib/cache/public";

type IcaiSyncService = { fetch(request: Request): Promise<Response> };
type SyncPayload = { ok?: boolean; summary?: IcaiSyncSummary; error?: string };

function getService():IcaiSyncService{try{const{env}=getCloudflareContext();const service=(env as unknown as Record<string,unknown>).ICAI_SYNC_SERVICE as IcaiSyncService|undefined;if(service&&typeof service.fetch==="function")return service;}catch{}throw new Error("ICAI sync service binding is unavailable. Use the Cloudflare multi-Worker runtime for sync operations.");}

export async function runIcaiSync({trigger,requestedBy=null}:{trigger:"cron"|"manual"|"test";requestedBy?:string|null}):Promise<IcaiSyncSummary>{const sync=getIcaiSyncConfig();if(!sync.enabled)throw new Error("ICAI synchronization is disabled for this environment.");const response=await getService().fetch(new Request("https://icai-sync.internal/run",{method:"POST",headers:{"content-type":"application/json","x-ca-progress-internal":"ca-progress-v2-web","x-ca-progress-icai-user-agent":sync.userAgent,"x-ca-progress-icai-enabled":String(sync.enabled)},body:JSON.stringify({trigger,requestedBy})}));const text=await response.text();let payload:SyncPayload={};if(text){try{payload=JSON.parse(text) as SyncPayload;}catch{payload={};}}if(!response.ok||!payload.ok||!payload.summary)throw new Error(payload.error||`ICAI sync service failed (${response.status}).`);await invalidateSharedPublicCache(["icai"]);return payload.summary;}
