import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export async function recordSystemHealth(input: {
  component: string;
  status: "ok" | "degraded" | "down";
  details?: Json;
  correlationId?: string;
}) {
  const client = createAdminSupabaseClient();
  const { error } = await client.from("system_health_log").insert({
    component: input.component,
    status: input.status,
    details: input.details ?? {},
    correlation_id: input.correlationId ?? null,
  });
  if (error) throw error;
}
