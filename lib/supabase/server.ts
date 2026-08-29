import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "./database.types";

export async function createServerSupabaseClient() {
  const config = getSupabasePublicConfig();
  if (!config.configured) throw new Error("V2 Supabase server configuration is missing.");
  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can read cookies but cannot always write them.
          // Phase 2 introduces the auth refresh boundary responsible for cookie writes.
        }
      },
    },
  });
}
