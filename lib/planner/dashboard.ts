import "server-only";

import { getHotD1Database } from "@/lib/data/d1/runtime";
import type { Database } from "@/lib/data/database.types";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
const DAY_MS = 86_400_000;
function safeTimeZone(timezone: string) { try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date()); return timezone; } catch { return "UTC"; } }
function localDateKey(date: Date, timezone: string) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTimeZone(timezone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const map = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${map.year}-${map.month}-${map.day}`; }

export async function getPlannerDashboardSummary(userId: string, timezone: string, now = new Date()) {
  const start = new Date(now.valueOf() - DAY_MS).toISOString();
  const end = new Date(now.valueOf() + DAY_MS).toISOString();
  const response = await getHotD1Database().prepare("SELECT id,task_kind,due_at,estimated_minutes FROM tasks WHERE user_id=?1 AND status='todo' AND due_at>=?2 AND due_at<=?3 ORDER BY due_at ASC LIMIT 250").bind(userId, start, end).all<TaskRow>();
  const todayKey = localDateKey(now, timezone);
  const today = (response.results ?? []).filter((row) => localDateKey(new Date(row.due_at), timezone) === todayKey);
  return {
    taskCount: today.length,
    revisionTaskCount: today.filter((row) => row.task_kind === "revision").length,
    testTaskCount: today.filter((row) => row.task_kind === "test").length,
    estimatedMinutes: today.reduce((sum, row) => sum + row.estimated_minutes, 0),
  };
}


export async function getLatestStoredPlanRecommendation(userId: string) {
  try {
    const result = await getHotD1Database().prepare(
      "SELECT i.title,i.item_kind,i.chapter_id,i.subject_id,p.plan_date FROM daily_plans p JOIN daily_plan_items i ON i.plan_id=p.id WHERE p.user_id=?1 AND i.status='planned' ORDER BY p.plan_date DESC,i.position ASC LIMIT 1"
    ).bind(userId).all<{title:string;item_kind:string;chapter_id:string|null;subject_id:string|null;plan_date:string}>();
    const row = result.results?.[0];
    return row ? { title: row.title, description: `From your stored ${row.plan_date} study plan.`, href: "/planner/today" } : null;
  } catch {
    return null;
  }
}
