import "server-only";

import { getPublicRuntimeConfig, getSupabasePublicConfig } from "@/lib/env";
import { logEvent } from "@/lib/logging/logger";
import { createServerSupabaseClient, isCloudflareDataRuntime } from "@/lib/supabase/server";

export type DatabaseHealth = "ok" | "degraded" | "not_configured";

export async function getHealthSnapshot(correlationId: string) {
  const runtime = getPublicRuntimeConfig();
  const supabaseConfig = getSupabasePublicConfig();
  const cloudflareDataRuntime = isCloudflareDataRuntime();
  let database: DatabaseHealth = "not_configured";

  if (cloudflareDataRuntime || supabaseConfig.configured) {
    try {
      const dataClient = await createServerSupabaseClient();
      const { error } = await dataClient.from("app_settings").select("key").limit(1);
      database = error ? "degraded" : "ok";
      if (error) logEvent("warn", "health.database.degraded", { correlationId, code: error.code });
    } catch (error) {
      database = "degraded";
      logEvent("error", "health.database.exception", { correlationId, error: error instanceof Error ? error.message : "unknown" });
    }
  }

  const status = database === "degraded" ? "degraded" : "ok";
  const snapshot = {
    status,
    service: "ca-progress-v2",
    environment: runtime.appEnv,
    version: runtime.appVersion,
    timestamp: new Date().toISOString(),
    correlationId,
    checks: { database },
  } as const;

  logEvent(status === "ok" ? "info" : "warn", "health.request", snapshot);
  return snapshot;
}
