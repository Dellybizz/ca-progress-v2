import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
const DAY_MS = 86_400_000;
function safeTimeZone(timezone: string) { try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date()); return timezone; } catch { return "UTC"; } }
function localDateKey(date: Date, timezone: string) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTimeZone(timezone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const map = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${map.year}-${map.month}-${map.day}`; }

export async function getPlannerDashboardSummary(userId: string, timezone: string, now = new Date()) {
  const supabase = await createServerSupabaseClient();
  const start = new Date(now.valueOf() - DAY_MS).toISOString();
  const end = new Date(now.valueOf() + DAY_MS).toISOString();
  const response = await supabase.from("tasks").select("*").eq("user_id", userId).eq("status", "todo").gte("due_at", start).lte("due_at", end).order("due_at");
  if (response.error) throw new Error(`Today tasks could not be loaded: ${response.error.message}`);
  const todayKey = localDateKey(now, timezone);
  const today = ((response.data ?? []) as TaskRow[]).filter((row) => localDateKey(new Date(row.due_at), timezone) === todayKey);
  return {
    taskCount: today.length,
    revisionTaskCount: today.filter((row) => row.task_kind === "revision").length,
    testTaskCount: today.filter((row) => row.task_kind === "test").length,
    estimatedMinutes: today.reduce((sum, row) => sum + row.estimated_minutes, 0),
  };
}
