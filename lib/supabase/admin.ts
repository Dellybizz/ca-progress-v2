import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminConfig } from "@/lib/env";
import type { Database } from "./database.types";

export function createAdminSupabaseClient() {
  const config = getSupabaseAdminConfig();
  if (!config.configured) throw new Error("V2 Supabase service-role configuration is missing.");

  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
