// OpenNext generates this module during `opennextjs-cloudflare build`.
// @ts-expect-error The generated worker does not exist before the Cloudflare build step.
import openNextWorker from "./.open-next/worker.js";
import { CommunityChannelCoordinator } from "./community-coordinator";

export { CommunityChannelCoordinator };

type ServiceBinding = { fetch(request: Request): Promise<Response> };
type QueueBinding = { send(body: BackgroundJob, options?: { delaySeconds?: number }): Promise<void> };
type D1Statement = { bind(...values: unknown[]): D1Statement; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>; run<T = Record<string, unknown>>(): Promise<{ success?: boolean; results?: T[] }> };
type D1Database = { prepare(query: string): D1Statement };
type WorkerEnv = { ICAI_SYNC_SERVICE?: ServiceBinding; BACKGROUND_JOBS?: QueueBinding; DB?: D1Database; ICAI_SYNC_ENABLED?: string; ICAI_SYNC_USER_AGENT?: string };
type WorkerContext = { waitUntil(promise: Promise<unknown>): void };
type ScheduledController = { scheduledTime: number; cron: string };
type QueueMessage<T> = { id: string; attempts: number; body: T; ack(): void; retry(): void };
type QueueBatch<T> = { messages: QueueMessage<T>[] };
type JobType = "icai-sync" | "icai-phase5-review-probe" | "notification-fanout" | "analytics-aggregate" | "attachment-process" | "cleanup" | "ai-plan-generation";
type BackgroundJob = { id: string; type: JobType; idempotencyKey: string; payload: Record<string, unknown>; createdBy?: string | null };
type LegacyIcaiJob = { type: "icai-sync"; idempotencyKey: string; scheduledTime: number };

const ICAI_SERVICE_TIMEOUT_MS = 20_000;

type IcaiServicePayload = {
  ok?: boolean;
  result?: {
    runId?: string;
    sourceIds?: string[];
    status?: string;
    requestIntervalSeconds?: number;
  };
  summary?: unknown;
  error?: string;
};

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1000} seconds.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function callIcaiService(env: WorkerEnv, path: "/start" | "/source" | "/finalize", body: Record<string, unknown>) {
  if (!env.ICAI_SYNC_SERVICE) throw new Error("ICAI sync service binding is unavailable.");
  const response = await withTimeout(env.ICAI_SYNC_SERVICE.fetch(new Request(`https://icai-sync.internal${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ca-progress-internal": "ca-progress-v2-web",
      "x-ca-progress-icai-user-agent": env.ICAI_SYNC_USER_AGENT || "CA Progress V2 Official ICAI Monitor/phase8",
      "x-ca-progress-icai-enabled": String(env.ICAI_SYNC_ENABLED !== "false"),
    },
    body: JSON.stringify(body),
  })), ICAI_SERVICE_TIMEOUT_MS, `ICAI service ${path}`);
  const text = await response.text();
  let payload: IcaiServicePayload = {};
  if (text) {
    try { payload = JSON.parse(text) as IcaiServicePayload; }
    catch { throw new Error(`ICAI service ${path} returned malformed JSON (${response.status}).`); }
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error || `ICAI service ${path} failed (${response.status}).`);
  return payload;
}

async function executeIcaiQueueJob(job: BackgroundJob, env: WorkerEnv) {
  if (!env.BACKGROUND_JOBS) throw new Error("Background Queue binding is unavailable for ICAI continuation.");
  const mode = job.payload.mode;
  if (mode === "source") {
    const runId = typeof job.payload.runId === "string" ? job.payload.runId : null;
    const sourceIds = Array.isArray(job.payload.sourceIds)
      ? job.payload.sourceIds.filter((value): value is string => typeof value === "string")
      : [];
    const sourceIndex = Number(job.payload.sourceIndex);
    if (!runId || !Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sourceIds.length) {
      throw new Error("Invalid ICAI source continuation payload.");
    }
    const sourceId = sourceIds[sourceIndex];
    const payload = await callIcaiService(env, "/source", { runId, sourceId });
    const result = payload.result;
    if (!result) throw new Error("ICAI service returned no source result.");
    if (result.status === "cancelled") return;
    const nextIndex = sourceIndex + 1;
    if (nextIndex < sourceIds.length) {
      const nextSourceId = sourceIds[nextIndex];
      await env.BACKGROUND_JOBS.send({
        id: crypto.randomUUID(),
        type: "icai-sync",
        idempotencyKey: `icai-sync-source:${runId}:${nextIndex}:${nextSourceId}`,
        payload: { ...job.payload, mode: "source", runId, sourceIds, sourceIndex: nextIndex },
        createdBy: job.createdBy ?? null,
      }, { delaySeconds: Math.max(0, Math.min(900, Number(result.requestIntervalSeconds ?? 0))) });
      return;
    }
    await callIcaiService(env, "/finalize", { runId });
    return;
  }

  const trigger = job.payload.trigger === "manual" ? "manual" : job.payload.trigger === "test" ? "test" : "cron";
  const requestedBy = typeof job.payload.requestedBy === "string" ? job.payload.requestedBy : null;
  const payload = await callIcaiService(env, "/start", { trigger, requestedBy, orchestrationKey: job.idempotencyKey });
  const runId = payload.result?.runId;
  const sourceIds = payload.result?.sourceIds?.filter((value): value is string => typeof value === "string") ?? [];
  const firstSourceId = sourceIds[0];
  if (!runId || !firstSourceId) throw new Error("ICAI continuation returned no active sources.");
  await env.BACKGROUND_JOBS.send({
    id: crypto.randomUUID(),
    type: "icai-sync",
    idempotencyKey: `icai-sync-source:${runId}:0:${firstSourceId}`,
    payload: { ...job.payload, mode: "source", runId, sourceIds, sourceIndex: 0 },
    createdBy: job.createdBy ?? null,
  });
}

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
  if (input.type !== "icai-sync" && input.type !== "icai-phase5-review-probe" && input.type !== "notification-fanout" && input.type !== "analytics-aggregate" && input.type !== "attachment-process" && input.type !== "cleanup" && input.type !== "ai-plan-generation") return null;
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
    if (job.type === "icai-sync") {
      await executeIcaiQueueJob(job, env);
    } else {
      const response = await openNextWorker.fetch(new Request("https://internal.ca-progress/api/internal/background-jobs", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ca-progress-internal": "ca-progress-v2-background-job" },
        body: JSON.stringify(job),
      }), env as unknown as Record<string, unknown>, { waitUntil() {} } as WorkerContext);
      if (!response.ok) throw new Error((await response.text()).slice(0, 1000));
    }
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
const READ_API_RATE_LIMIT = 300;
const WRITE_API_RATE_LIMIT = 60;
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

function checkRateLimit(key: string, limit: number) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    if (rateBuckets.size > 10_000) rateBuckets.delete(rateBuckets.keys().next().value!);
    return { allowed: true, remaining: limit - 1 };
  }
  current.count += 1;
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count) };
}

async function handleRequest(request: Request, env: WorkerEnv, ctx: WorkerContext) {
  const id = requestId(request);
  const startedAt = performance.now();
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/internal/background-jobs") {
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store", "x-request-id": id } });
  }
  const isApi = pathname.startsWith("/api/");
  const isRead = request.method === "GET" || request.method === "HEAD";
  const limit = isRead ? READ_API_RATE_LIMIT : WRITE_API_RATE_LIMIT;
  const rate = isApi && pathname !== "/api/health"
    ? checkRateLimit(`${rateLimitKey(request)}:${isRead ? "read" : "write"}`, limit)
    : { allowed: true, remaining: limit };
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests. Please retry shortly.", requestId: id }), {
      status: 429,
      headers: { "content-type": "application/json", "cache-control": "no-store", "retry-after": "60", "x-request-id": id, "x-ratelimit-limit": String(limit), "x-ratelimit-remaining": "0" },
    });
  }
  const forwarded = new Request(request, { headers: new Headers(request.headers) });
  forwarded.headers.set("x-request-id", id);
  try {
    const response = await openNextWorker.fetch(forwarded, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("x-request-id", id);
    if (isApi) {
      headers.set("x-ratelimit-limit", String(limit));
      headers.set("x-ratelimit-remaining", String(rate.remaining));
    }
    headers.set("server-timing", `worker;dur=${Math.round((performance.now() - startedAt) * 100) / 100}`);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    const fingerprint = errorFingerprint(error);
    console.error(JSON.stringify({ event: "worker.request_error", requestId: id, fingerprint, path: pathname }));
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
    // D1 serializes writes. Running a delivered batch concurrently allowed one
    // message to mark itself running while a sibling failed before persistence,
    // causing Cloudflare to retry the entire batch and orphan the first job.
    for (const message of batch.messages) await runQueuedJob(message, env);
  },
};

export default worker;
