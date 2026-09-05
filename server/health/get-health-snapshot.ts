import "server-only";

import { getPublicRuntimeConfig } from "@/lib/env";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { logEvent } from "@/lib/logging/logger";
import { getServerRuntimeValue } from "@/lib/cloudflare/runtime-env";

export type DatabaseHealth = "ok" | "degraded" | "not_configured";

export async function getHealthSnapshot(correlationId: string) {
  const runtime = getPublicRuntimeConfig();
  const startedAt = performance.now();
  let database: DatabaseHealth = "not_configured";

  try {
    await getD1RuntimeDatabase().prepare("SELECT key FROM app_settings LIMIT 1").first();
    database = "ok";
  } catch (error) {
    database = "degraded";
    logEvent("error", "health.database.exception", { correlationId, error: error instanceof Error ? error.message : "unknown" });
  }

  const status = database === "degraded" ? "degraded" : "ok";
  const snapshot = {
    status,
    service: "ca-progress-v2",
    environment: runtime.appEnv,
    version: runtime.appVersion,
    timestamp: new Date().toISOString(),
    correlationId,
    checks: { database, billingBinding: getServerRuntimeValue("BILLING_SERVICE") ? "configured" : "optional", icaiBinding: getServerRuntimeValue("ICAI_SYNC_SERVICE") ? "configured" : "optional" },
    latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
  } as const;

  logEvent(status === "ok" ? "info" : "warn", "health.request", snapshot);
  return snapshot;
}
