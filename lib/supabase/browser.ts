"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "./database.types";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createBrowserSupabaseClient() {
  const config = getSupabasePublicConfig();
  if (!config.configured) throw new Error("V2 Supabase browser configuration is missing.");
  browserClient ??= createBrowserClient<Database>(config.url, config.publishableKey);
  return browserClient;
}
