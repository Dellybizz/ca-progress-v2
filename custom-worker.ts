// OpenNext generates this module during `opennextjs-cloudflare build`.
// @ts-expect-error The generated worker does not exist before the Cloudflare build step.
import openNextWorker from "./.open-next/worker.js";
import { CommunityChannelCoordinator } from "./community-coordinator";

export { CommunityChannelCoordinator };

type ServiceBinding = { fetch(request: Request): Promise<Response> };
type QueueBinding = { send(body: BackgroundJob): Promise<void> };
type D1Statement = { bind(...values: unknown[]): D1Statement; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>; run<T = Record<string, unknown>>(): Promise<{ success?: boolean; results?: T[] }> };
type D1Database = { prepare(query: string): D1Statement };
type WorkerEnv = { ICAI_SYNC_SERVICE?: ServiceBinding; BACKGROUND_JOBS?: QueueBinding; DB?: D1Database; ICAI_SYNC_ENABLED?: string; ICAI_SYNC_USER_AGENT?: string };
type WorkerContext = { waitUntil(promise: Promise<unknown>): void };
type ScheduledController = { scheduledTime: number; cron: string };
type QueueMessage<T> = { id: string; attempts: number; body: T; ack(): void; retry(): void };
type QueueBatch<T> = { messages: QueueMessage<T>[] };
type JobType = "icai-sync" | "notification-fanout" | "analytics-aggregate" | "attachment-process" | "cleanup" | "ai-plan-generation";
type BackgroundJob = { id: string; type: JobType; idempotencyKey: string; payload: Record<string, unknown>; createdBy?: string | null };
type LegacyIcaiJob = { type: "icai-sync"; idempotencyKey: string; scheduledTime: number };

function scheduledJob(controller: ScheduledController): BackgroundJob {
  const scheduledTime = controller.scheduledTime;
  return {
    id: crypto.randomUUID(),
    type: "icai-sync",
    idempotencyKey: `icai-sync:${new Date(scheduledTime).toISOString()}`,
    payload: { trigger: "cron", requestedBy: null, scheduledTime },
  };
}

function normalizeJob(value: unknown): BackgroundJob | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<BackgroundJob> & Partial<LegacyIcaiJob>;
  if (input.type !== "icai-sync" && input.type !== "notification-fanout" && input.type !== "analytics-aggregate" && input.type !== "attachment-process" && input.type !== "cleanup" && input.type !== "ai-plan-generation") return null;
  if (typeof input.idempotencyKey !== "string" || !input.idempotencyKey) return null;
  return {
    id: typeof input.id === "string" ? input.id : crypto.randomUUID(),
    type: input.type,
    idempotencyKey: input.idempotencyKey.slice(0, 180),
    payload: input.payload && typeof input.payload === "object" ? input.payload as Record<string, unknown> : { scheduledTime: (input as LegacyIcaiJob).scheduledTime },
    createdBy: typeof input.createdBy === "string" ? input.createdBy : null,
  };
}

async function hashPayload(job: BackgroundJob) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(job))));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function runQueuedJob(message: QueueMessage<unknown>, env: WorkerEnv) {
  if (!env.DB) throw new Error("DB binding is required for queue idempotency.");
  const job = normalizeJob(message.body);
  if (!job) { message.ack(); return; }
  const payloadHash = await hashPayload(job);
  const existing = await env.DB.prepare("SELECT id,status,payload_json,attempts,max_attempts FROM background_jobs WHERE idempotency_key=?1 LIMIT 1").bind(job.idempotencyKey).first<{ id:string; status:string; payload_json:string; attempts:number; max_attempts:number }>();
  if (existing?.status === "succeeded") { message.ack(); return; }
  if (existing && existing.payload_json !== JSON.stringify(job.payload)) throw new Error("Queue idempotency key payload mismatch.");
  if (!existing) {
    await env.DB.prepare("INSERT INTO background_jobs(id,idempotency_key,job_type,payload_json,status,attempts,max_attempts,created_by) VALUES(?1,?2,?3,?4,'queued',0,5,?5)")
      .bind(job.id, job.idempotencyKey, job.type, JSON.stringify(job.payload), job.createdBy ?? null).run();
  }
  await env.DB.prepare("UPDATE background_jobs SET status='running',attempts=attempts+1,started_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?1").bind(job.idempotencyKey).run();
  try {
    const response = await openNextWorker.fetch(new Request("https://internal.ca-progress/api/internal/background-jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ca-progress-internal": "ca-progress-v2-background-job" },
      body: JSON.stringify(job),
    }), env as unknown as Record<string, unknown>, { waitUntil() {} } as WorkerContext);
    if (!response.ok) throw new Error((await response.text()).slice(0, 1000));
    await env.DB.prepare("UPDATE background_jobs SET status='succeeded',finished_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?1").bind(job.idempotencyKey).run();
    message.ack();
  } catch (error) {
    const detail = (error instanceof Error ? error.message : "Background job failed.").slice(0, 1000);
    const attempts = (existing?.attempts ?? 0) + 1;
    const maxAttempts = existing?.max_attempts ?? 5;
    if (attempts >= maxAttempts || message.attempts >= maxAttempts) {
      await env.DB.prepare("UPDATE background_jobs SET status='dead_letter',finished_at=CURRENT_TIMESTAMP,last_error=?1,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?2").bind(detail, job.idempotencyKey).run();
      await env.DB.prepare("INSERT OR IGNORE INTO background_job_dead_letters(id,job_id,idempotency_key,job_type,payload_json,attempts,error) SELECT ?1,id,idempotency_key,job_type,payload_json,attempts,?2 FROM background_jobs WHERE idempotency_key=?3").bind(crypto.randomUUID(), detail, job.idempotencyKey).run();
      message.ack();
    } else {
      await env.DB.prepare("UPDATE background_jobs SET status='failed',last_error=?1,updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?2").bind(detail, job.idempotencyKey).run();
      message.retry();
    }
  }
}

const worker = {
  fetch(request: Request, env: WorkerEnv, ctx: WorkerContext) { return openNextWorker.fetch(request, env, ctx); },
  scheduled(controller: ScheduledController, env: WorkerEnv, ctx: WorkerContext) {
    if (!env.BACKGROUND_JOBS) throw new Error("BACKGROUND_JOBS queue binding is required in the production runtime.");
    ctx.waitUntil(env.BACKGROUND_JOBS.send(scheduledJob(controller)));
  },
  async queue(batch: QueueBatch<unknown>, env: WorkerEnv) {
    await Promise.all(batch.messages.map((message) => runQueuedJob(message, env)));
  },
};

export default worker;
