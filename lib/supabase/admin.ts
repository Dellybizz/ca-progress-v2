import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerRuntimeValue } from "@/lib/cloudflare/runtime-env";
import { createD1AdminCompatClient } from "@/lib/data/d1/supabase-compat";
import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "./database.types";

export function isCloudflareDataRuntime() {
  return getServerRuntimeValue("CA_DATA_RUNTIME").toLowerCase() === "cloudflare";
}

export function getSupabaseAdminRuntimeConfig() {
  const publicConfig = getSupabasePublicConfig();
  const serviceRoleKey = getServerRuntimeValue("SUPABASE_SERVICE_ROLE_KEY");
  return { ...publicConfig, serviceRoleKey, configured: Boolean(publicConfig.url && serviceRoleKey) } as const;
}

export function createAdminSupabaseClient(): SupabaseClient<Database> {
  if (isCloudflareDataRuntime()) return createD1AdminCompatClient() as unknown as SupabaseClient<Database>;
  const config = getSupabaseAdminRuntimeConfig();
  if (!config.configured) throw new Error("V2 Supabase service-role configuration is missing.");
  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
