// OpenNext generates this module during `opennextjs-cloudflare build`.
// @ts-expect-error The generated worker does not exist before the Cloudflare build step.
import openNextWorker from "./.open-next/worker.js";

type ServiceBinding = { fetch(request: Request): Promise<Response> };
type WorkerEnv = {
  ICAI_SYNC_SERVICE?: ServiceBinding;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ICAI_SYNC_ENABLED?: string;
  ICAI_SYNC_USER_AGENT?: string;
};
type WorkerContext = { waitUntil(promise: Promise<unknown>): void };
type ScheduledController = { scheduledTime: number; cron: string };

const worker = {
  fetch(request: Request, env: WorkerEnv, ctx: WorkerContext) {
    return openNextWorker.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: WorkerEnv, ctx: WorkerContext) {
    const task = (async () => {
      if (!env.ICAI_SYNC_SERVICE) throw new Error("ICAI_SYNC_SERVICE binding is missing from the Cloudflare Worker.");
      if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("V2 Supabase runtime configuration is missing for scheduled ICAI sync.");
      const response = await env.ICAI_SYNC_SERVICE.fetch(new Request("https://icai-sync.internal/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ca-progress-internal": "ca-progress-v2-web",
          "x-ca-progress-supabase-url": env.NEXT_PUBLIC_SUPABASE_URL,
          "x-ca-progress-service-role": env.SUPABASE_SERVICE_ROLE_KEY,
          "x-ca-progress-icai-user-agent": env.ICAI_SYNC_USER_AGENT || "CA Progress V2 Official ICAI Monitor/phase8",
          "x-ca-progress-icai-enabled": env.ICAI_SYNC_ENABLED || "true",
          "x-ca-progress-scheduled-at": new Date(controller.scheduledTime).toISOString(),
        },
        body: JSON.stringify({ trigger: "cron", requestedBy: null }),
      }));
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Phase 8 scheduled sync service failed (${response.status}): ${body.slice(0, 500)}`);
      }
    })();
    ctx.waitUntil(task);
  },
};

export default worker;
