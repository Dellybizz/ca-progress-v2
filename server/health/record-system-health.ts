import "server-only";

import { createD1AdminClient } from "@/lib/data/d1/client";
import type { Json } from "@/lib/supabase/database.types";

export async function recordSystemHealth(input: {
  component: string;
  status: "ok" | "degraded" | "down";
  details?: Json;
  correlationId?: string;
}) {
  const client = createD1AdminClient();
  const { error } = await client.from("system_health_log").insert({
    component: input.component,
    status: input.status,
    details: input.details ?? {},
    correlation_id: input.correlationId ?? null,
  });
  if (error) throw error;
}
