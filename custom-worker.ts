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


async function runQueuedJob(message: QueueMessage<unknown>, env: WorkerEnv) {
  if (!env.DB) throw new Error("DB binding is required for queue idempotency.");
  const job = normalizeJob(message.body);
  if (!job) { message.ack(); return; }
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

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

function errorFingerprint(error: unknown) {
  const source = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function requestId(request: Request) {
  const incoming = request.headers.get("x-request-id")?.trim();
  return incoming && /^[A-Za-z0-9._:-]{8,120}$/.test(incoming) ? incoming : crypto.randomUUID();
}

function rateLimitKey(request: Request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    if (rateBuckets.size > 10_000) rateBuckets.delete(rateBuckets.keys().next().value!);
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }
  current.count += 1;
  return { allowed: current.count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - current.count) };
}

async function handleRequest(request: Request, env: WorkerEnv, ctx: WorkerContext) {
  const id = requestId(request);
  const startedAt = performance.now();
  const rate = checkRateLimit(rateLimitKey(request));
  if (!rate.allowed && new URL(request.url).pathname !== "/api/health") {
    return new Response(JSON.stringify({ error: "Too many requests. Please retry shortly.", requestId: id }), {
      status: 429,
      headers: { "content-type": "application/json", "cache-control": "no-store", "retry-after": "60", "x-request-id": id, "x-ratelimit-limit": String(RATE_LIMIT), "x-ratelimit-remaining": "0" },
    });
  }
  const forwarded = new Request(request, { headers: new Headers(request.headers) });
  forwarded.headers.set("x-request-id", id);
  try {
    const response = await openNextWorker.fetch(forwarded, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("x-request-id", id);
    headers.set("x-ratelimit-limit", String(RATE_LIMIT));
    headers.set("x-ratelimit-remaining", String(rate.remaining));
    headers.set("server-timing", `worker;dur=${Math.round((performance.now() - startedAt) * 100) / 100}`);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    const fingerprint = errorFingerprint(error);
    console.error(JSON.stringify({ event: "worker.request_error", requestId: id, fingerprint, path: new URL(request.url).pathname }));
    return new Response(JSON.stringify({ error: "The service encountered a temporary error.", requestId: id }), {
      status: 500,
      headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": id, "x-error-fingerprint": fingerprint },
    });
  }
}

const worker = {
  fetch(request: Request, env: WorkerEnv, ctx: WorkerContext) { return handleRequest(request, env, ctx); },
  scheduled(controller: ScheduledController, env: WorkerEnv, ctx: WorkerContext) {
    if (!env.BACKGROUND_JOBS) throw new Error("BACKGROUND_JOBS queue binding is required in the production runtime.");
    const jobs: BackgroundJob[] = controller.cron === "0 * * * *"
      ? [
          { id: crypto.randomUUID(), type: "analytics-aggregate", idempotencyKey: `analytics-aggregate:${new Date(controller.scheduledTime).toISOString().slice(0, 13)}`, payload: { date: new Date(controller.scheduledTime).toISOString().slice(0, 10) } },
          { id: crypto.randomUUID(), type: "cleanup", idempotencyKey: `cleanup:${new Date(controller.scheduledTime).toISOString().slice(0, 13)}`, payload: { retentionDays: 30 } },
        ]
      : [scheduledJob(controller)];
    ctx.waitUntil(Promise.all(jobs.map((job) => env.BACKGROUND_JOBS!.send(job))).then(() => undefined));
  },
  async queue(batch: QueueBatch<unknown>, env: WorkerEnv) {
    await Promise.all(batch.messages.map((message) => runQueuedJob(message, env)));
  },
};

export default worker;
