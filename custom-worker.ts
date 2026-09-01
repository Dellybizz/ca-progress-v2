// OpenNext generates this module during `opennextjs-cloudflare build`.
// @ts-expect-error The generated worker does not exist before the Cloudflare build step.
import openNextWorker from "./.open-next/worker.js";

type ServiceBinding = { fetch(request: Request): Promise<Response> };
type QueueBinding = { send(body: BackgroundJob): Promise<void> };
type D1Statement = { bind(...values: unknown[]): D1Statement; first<T = Record<string, unknown>>(): Promise<T | null>; run<T = Record<string, unknown>>(): Promise<{ success?: boolean; results?: T[] }> };
type D1Database = { prepare(query: string): D1Statement };
type WorkerEnv = { ICAI_SYNC_SERVICE?: ServiceBinding; BACKGROUND_JOBS?: QueueBinding; DB?: D1Database; ICAI_SYNC_ENABLED?: string; ICAI_SYNC_USER_AGENT?: string };
type WorkerContext = { waitUntil(promise: Promise<unknown>): void };
type ScheduledController = { scheduledTime: number; cron: string };
type QueueMessage<T> = { id:string; attempts:number; body:T; ack():void; retry():void };
type QueueBatch<T> = { messages: QueueMessage<T>[] };
type IcaiSyncJob = { type:"icai-sync"; idempotencyKey:string; scheduledTime:number };
type BackgroundJob = IcaiSyncJob;
type JobLedgerRow = { status:string; payload_hash:string };

function requiredIcaiService(env:WorkerEnv){if(!env.ICAI_SYNC_SERVICE)throw new Error("ICAI_SYNC_SERVICE binding is missing from the Cloudflare Worker.");return env.ICAI_SYNC_SERVICE;}
async function runIcaiSync(env:WorkerEnv,scheduledTime:number){const service=requiredIcaiService(env);const response=await service.fetch(new Request("https://icai-sync.internal/run",{method:"POST",headers:{"content-type":"application/json","x-ca-progress-internal":"ca-progress-v2-web","x-ca-progress-icai-user-agent":env.ICAI_SYNC_USER_AGENT||"CA Progress V2 Official ICAI Monitor/phase8","x-ca-progress-icai-enabled":env.ICAI_SYNC_ENABLED||"true","x-ca-progress-scheduled-at":new Date(scheduledTime).toISOString()},body:JSON.stringify({trigger:"cron",requestedBy:null})}));if(!response.ok){const body=await response.text();throw new Error(`Phase 8 scheduled sync service failed (${response.status}): ${body.slice(0,500)}`);}}
function scheduledJob(controller:ScheduledController):IcaiSyncJob{return{type:"icai-sync",idempotencyKey:`icai-sync:${new Date(controller.scheduledTime).toISOString()}`,scheduledTime:controller.scheduledTime};}
async function hashPayload(job:BackgroundJob){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(job))));return Array.from(bytes,(value)=>value.toString(16).padStart(2,"0")).join("");}
async function runQueuedJob(message:QueueMessage<BackgroundJob>,env:WorkerEnv){if(message.body.type!=="icai-sync"){message.ack();return;}if(!env.DB)throw new Error("DB binding is required for queue idempotency.");const job=message.body;const payloadHash=await hashPayload(job);const existing=await env.DB.prepare("SELECT status,payload_hash FROM background_job_executions WHERE idempotency_key=?1 LIMIT 1").bind(job.idempotencyKey).first<JobLedgerRow>();if(existing?.status==="succeeded"){if(existing.payload_hash!==payloadHash)throw new Error("Queue idempotency key payload mismatch.");message.ack();return;}if(existing&&existing.payload_hash!==payloadHash)throw new Error("Queue idempotency key payload mismatch.");await env.DB.prepare(`INSERT INTO background_job_executions(idempotency_key,job_type,payload_hash,status,attempts) VALUES(?1,'icai-sync',?2,'running',1) ON CONFLICT(idempotency_key) DO UPDATE SET status='running',attempts=background_job_executions.attempts+1,started_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP`).bind(job.idempotencyKey,payloadHash).run();try{await runIcaiSync(env,job.scheduledTime);await env.DB.prepare("UPDATE background_job_executions SET status='succeeded',finished_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?1").bind(job.idempotencyKey).run();message.ack();}catch(error){const detail=(error instanceof Error?error.message:"ICAI sync queue job failed.").slice(0,1000);await env.DB.prepare("UPDATE background_job_executions SET status='failed',finished_at=CURRENT_TIMESTAMP,last_error=?1,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?2").bind(detail,job.idempotencyKey).run();message.retry();}}

export default {
  fetch(request:Request,env:WorkerEnv,ctx:WorkerContext){return openNextWorker.fetch(request,env,ctx);},
  scheduled(controller:ScheduledController,env:WorkerEnv,ctx:WorkerContext){if(!env.BACKGROUND_JOBS)throw new Error("BACKGROUND_JOBS queue binding is required in the Phase 5 production runtime.");ctx.waitUntil(env.BACKGROUND_JOBS.send(scheduledJob(controller)));},
  async queue(batch:QueueBatch<BackgroundJob>,env:WorkerEnv){await Promise.all(batch.messages.map(async(message)=>{try{await runQueuedJob(message,env);}catch{message.retry();}}));},
};
