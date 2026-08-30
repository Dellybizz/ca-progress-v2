// OpenNext generates this module during `opennextjs-cloudflare build`.
// @ts-expect-error The generated worker does not exist before the Cloudflare build step.
import openNextWorker from "./.open-next/worker.js";
type Phase8Env = { ICAI_CRON_SECRET?: string };
type WorkerContext = { waitUntil(promise: Promise<unknown>): void };
type ScheduledController = { scheduledTime: number; cron: string };
export default { fetch(request: Request, env: Phase8Env, ctx: WorkerContext) { return openNextWorker.fetch(request, env, ctx); }, scheduled(controller: ScheduledController, env: Phase8Env, ctx: WorkerContext) { const task = (async () => { if (!env.ICAI_CRON_SECRET) throw new Error("ICAI_CRON_SECRET is missing from the Cloudflare Worker."); const request = new Request("https://ca-progress-v2.internal/api/cron/icai-sync", { method: "POST", headers: { "x-icai-cron-secret": env.ICAI_CRON_SECRET, "x-ca-progress-scheduled-at": new Date(controller.scheduledTime).toISOString() } }); const response = await openNextWorker.fetch(request, env, ctx); if (!response.ok) { const body = await response.text(); throw new Error(`Phase 8 scheduled sync failed (${response.status}): ${body.slice(0, 500)}`); } })(); ctx.waitUntil(task); } };
