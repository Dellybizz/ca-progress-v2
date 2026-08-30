import "server-only";

import { getAdminRoleForUser } from "@/lib/admin/service";
import { getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";

export type OperationalDecision = { allowed: boolean; reason?: string; code?: "MAINTENANCE_MODE" | "FEATURE_DISABLED" };

async function adminRest(path: string) {
  const db = getSupabaseAdminRuntimeConfig();
  if (!db.configured) return null;
  const response = await fetch(`${db.url}/rest/v1/${path}`, {
    headers: { apikey: db.serviceRoleKey, authorization: `Bearer ${db.serviceRoleKey}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}

function maintenanceCurrentlyActive(value: Record<string, unknown> | null) {
  if (!value?.enabled) return false;
  const now = Date.now();
  const starts = typeof value.starts_at === "string" ? Date.parse(value.starts_at) : null;
  const ends = typeof value.ends_at === "string" ? Date.parse(value.ends_at) : null;
  return (starts === null || Number.isNaN(starts) || starts <= now) && (ends === null || Number.isNaN(ends) || ends > now);
}

export async function getOperationalDecision(featureKey: string, userId?: string | null): Promise<OperationalDecision> {
  const [flagsRaw, maintenanceRaw] = await Promise.all([
    adminRest(`feature_flags?flag_key=eq.${encodeURIComponent(featureKey)}&select=enabled&limit=1`),
    adminRest("maintenance_settings?id=eq.true&select=enabled,message,starts_at,ends_at&limit=1"),
  ]);
  const flag = Array.isArray(flagsRaw) ? flagsRaw[0] as { enabled?: unknown } | undefined : undefined;
  if (flag && flag.enabled === false) return { allowed: false, code: "FEATURE_DISABLED", reason: "This operation is temporarily disabled by platform operations." };

  const maintenance = Array.isArray(maintenanceRaw) ? maintenanceRaw[0] as Record<string, unknown> | undefined : undefined;
  if (maintenanceCurrentlyActive(maintenance ?? null)) {
    const role = userId ? await getAdminRoleForUser(userId).catch(() => null) : null;
    if (!role) return { allowed: false, code: "MAINTENANCE_MODE", reason: typeof maintenance?.message === "string" ? maintenance.message : "CA Progress is temporarily in maintenance mode." };
  }
  return { allowed: true };
}

export async function assertOperationalMutationAllowed(featureKey: string, userId?: string | null) {
  const decision = await getOperationalDecision(featureKey, userId);
  if (!decision.allowed) {
    const error = new Error(decision.reason || "Operation unavailable.") as Error & { code?: string };
    error.code = decision.code;
    throw error;
  }
}
