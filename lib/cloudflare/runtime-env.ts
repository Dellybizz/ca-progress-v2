import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Read a server-only runtime value in both local/Node and deployed Cloudflare
 * environments. OpenNext exposes Worker variables/secrets on the Cloudflare
 * env binding, while local tooling commonly exposes them through process.env.
 */
export function getServerRuntimeValue(name: string): string {
  const processValue = process.env[name]?.trim();
  if (processValue) return processValue;

  try {
    const { env } = getCloudflareContext();
    const value = (env as unknown as Record<string, unknown>)[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}


export function performanceLoggingEnabled() {
  return getServerRuntimeValue("CA_PERF_LOGGING").toLowerCase() === "true";
}

export function logServerPerformance(name: string, startedAt: number, metadata: Record<string, string | number | boolean | null> = {}) {
  if (!performanceLoggingEnabled()) return;
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  console.info("[ca-span]", JSON.stringify({ type: "latency_span", name, duration_ms: durationMs, ...metadata }));
}

export async function measureServerPerformance<T>(name: string, operation: () => Promise<T>, metadata: Record<string, string | number | boolean | null> = {}) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    logServerPerformance(name, startedAt, metadata);
  }
}
