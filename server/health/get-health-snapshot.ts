import "server-only";

import { getPublicRuntimeConfig, getSupabasePublicConfig } from "@/lib/env";
import { getD1RuntimeDatabase } from "@/lib/data/d1/supabase-compat";
import { logEvent } from "@/lib/logging/logger";
import { createServerSupabaseClient, isCloudflareDataRuntime } from "@/lib/supabase/server";
import { getServerRuntimeValue } from "@/lib/cloudflare/runtime-env";

export type DatabaseHealth = "ok" | "degraded" | "not_configured";

export async function getHealthSnapshot(correlationId: string) {
  const runtime = getPublicRuntimeConfig();
  const supabaseConfig = getSupabasePublicConfig();
  const cloudflareDataRuntime = isCloudflareDataRuntime();
  const startedAt = performance.now();
  let database: DatabaseHealth = "not_configured";

  if (cloudflareDataRuntime || supabaseConfig.configured) {
    try {
      if (cloudflareDataRuntime) {
        await getD1RuntimeDatabase().prepare("SELECT key FROM app_settings LIMIT 1").first();
      } else {
        const dataClient = await createServerSupabaseClient();
        const { error } = await dataClient.from("app_settings").select("key").limit(1);
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
      }
      database = "ok";
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
    checks: { database, billingBinding: getServerRuntimeValue("BILLING_SERVICE") ? "configured" : "optional", icaiBinding: getServerRuntimeValue("ICAI_SYNC_SERVICE") ? "configured" : "optional" },
    latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
  } as const;

  logEvent(status === "ok" ? "info" : "warn", "health.request", snapshot);
  return snapshot;
}
