import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getIcaiSyncConfig } from "@/lib/env";
import { getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";
import type { IcaiSyncSummary } from "./types";

type IcaiSyncService = { fetch(request: Request): Promise<Response> };
type SyncPayload = { ok?: boolean; summary?: IcaiSyncSummary; error?: string };

function getService(): IcaiSyncService {
  try {
    const { env } = getCloudflareContext();
    const service = (env as unknown as Record<string, unknown>).ICAI_SYNC_SERVICE as IcaiSyncService | undefined;
    if (service && typeof service.fetch === "function") return service;
  } catch {
    // The user-facing app intentionally has no in-process fallback because the
    // heavy Phase 8 parser belongs to the isolated Worker, not the web bundle.
  }
  throw new Error("ICAI sync service binding is unavailable. Use the Cloudflare multi-Worker runtime for sync operations.");
}

export async function runIcaiSync({
  trigger,
  requestedBy = null,
}: {
  trigger: "cron" | "manual" | "test";
  requestedBy?: string | null;
}): Promise<IcaiSyncSummary> {
  const admin = getSupabaseAdminRuntimeConfig();
  const sync = getIcaiSyncConfig();
  if (!admin.configured) throw new Error("V2 Supabase service-role configuration is missing.");
  if (!sync.enabled) throw new Error("ICAI synchronization is disabled for this environment.");

  const response = await getService().fetch(new Request("https://icai-sync.internal/run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ca-progress-internal": "ca-progress-v2-web",
      "x-ca-progress-supabase-url": admin.url,
      "x-ca-progress-service-role": admin.serviceRoleKey,
      "x-ca-progress-icai-user-agent": sync.userAgent,
      "x-ca-progress-icai-enabled": String(sync.enabled),
    },
    body: JSON.stringify({ trigger, requestedBy }),
  }));

  const text = await response.text();
  let payload: SyncPayload = {};
  if (text) {
    try { payload = JSON.parse(text) as SyncPayload; } catch { payload = {}; }
  }
  if (!response.ok || !payload.ok || !payload.summary) throw new Error(payload.error || `ICAI sync service failed (${response.status}).`);
  return payload.summary;
}
