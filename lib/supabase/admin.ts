import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerRuntimeValue } from "@/lib/cloudflare/runtime-env";
import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "./database.types";

export function getSupabaseAdminRuntimeConfig() {
  const publicConfig = getSupabasePublicConfig();
  const serviceRoleKey = getServerRuntimeValue("SUPABASE_SERVICE_ROLE_KEY");

  return {
    ...publicConfig,
    serviceRoleKey,
    configured: Boolean(publicConfig.url && serviceRoleKey),
  } as const;
}

export function createAdminSupabaseClient() {
  const config = getSupabaseAdminRuntimeConfig();
  if (!config.configured) throw new Error("V2 Supabase service-role configuration is missing.");

  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
