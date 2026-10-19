import "server-only";

import { getPublicRuntimeConfig } from "@/lib/env";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { logEvent } from "@/lib/logging/logger";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

  let bindings:Record<string,unknown>={};try{bindings=getCloudflareContext().env as unknown as Record<string,unknown>;}catch{/* Local Node has no Worker service bindings. */}
  let billingOwnerRulesPhase:number|null=null,billingCheckoutPaused:boolean|null=null,billingHealthy=true;
  const billing=bindings.BILLING_SERVICE as {fetch(request:Request):Promise<Response>}|undefined;
  if(billing?.fetch){try{const response=await billing.fetch(new Request('https://billing.internal/health',{headers:{'x-ca-progress-internal':'ca-progress-v2-web'},signal:AbortSignal.timeout(10000)}));const body=await response.json() as {ownerRulesPhase?:number;releaseCheckoutPaused?:boolean};billingHealthy=response.ok;billingOwnerRulesPhase=body.ownerRulesPhase??null;billingCheckoutPaused=body.releaseCheckoutPaused??null;}catch{billingHealthy=false;}}
  const status = !billingHealthy||database === "degraded" ? "degraded" : "ok";
  const snapshot = {
    status,
    service: "ca-progress-v2",
    environment: runtime.appEnv,
    version: runtime.appVersion,
    timestamp: new Date().toISOString(),
    correlationId,
    checks: { database, billingBinding: billing?.fetch ? "configured" : "optional", icaiBinding: bindings.ICAI_SYNC_SERVICE ? "configured" : "optional", billingOwnerRulesPhase, billingCheckoutPaused, billingService: billingHealthy?"ok":"degraded" },
    latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
  } as const;

  logEvent(status === "ok" ? "info" : "warn", "health.request", snapshot);
  return snapshot;
}
