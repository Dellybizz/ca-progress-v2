import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getServerRuntimeValue } from "@/lib/cloudflare/runtime-env";
import { createD1ServerCompatClient } from "@/lib/data/d1/supabase-compat";
import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "./database.types";

export function isCloudflareDataRuntime() {
  return getServerRuntimeValue("CA_DATA_RUNTIME").toLowerCase() === "cloudflare";
}

export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  if (isCloudflareDataRuntime()) {
    return await createD1ServerCompatClient() as unknown as SupabaseClient<Database>;
  }

  const cookieStore = await cookies();
  const config = getSupabasePublicConfig();
  if (!config.configured) throw new Error("V2 Supabase server configuration is missing.");

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes and persists sessions.
        }
      },
    },
  });
}
