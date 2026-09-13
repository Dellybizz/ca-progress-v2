import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export type BackgroundJobType =
  | "icai-sync"
  | "icai-phase5-review-probe"
  | "notification-fanout"
  | "analytics-aggregate"
  | "attachment-process"
  | "cleanup"
  | "ai-plan-generation";

export type BackgroundJob = {
  id: string;
  type: BackgroundJobType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdBy?: string | null;
};

type QueueProducer = { send(body: BackgroundJob, options?: { delaySeconds?: number }): Promise<void> };

function producer(): QueueProducer | null {
  try {
    const { env } = getCloudflareContext();
    const value = (env as unknown as Record<string, unknown>).BACKGROUND_JOBS as QueueProducer | undefined;
    return value && typeof value.send === "function" ? value : null;
  } catch {
    return null;
  }
}

export async function enqueueBackgroundJob(input: {
  type: BackgroundJobType;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
  delaySeconds?: number;
}) {
  const job: BackgroundJob = {
    id: crypto.randomUUID(),
    type: input.type,
    idempotencyKey: input.idempotencyKey.slice(0, 180),
    payload: input.payload ?? {},
    createdBy: input.createdBy ?? null,
  };
  const queue = producer();
  if (!queue) throw new Error("Background job queue is unavailable.");
  const delaySeconds = input.delaySeconds == null ? undefined : Math.max(0, Math.min(86_400, Math.trunc(input.delaySeconds)));
  await queue.send(job, delaySeconds == null ? undefined : { delaySeconds });
  return job;
}

export function jobKey(type: BackgroundJobType, scope: string, value: string) {
  return `${type}:${scope}:${value}`.slice(0, 180);
}
