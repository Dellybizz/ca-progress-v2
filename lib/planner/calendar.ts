import "server-only";

import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import { createD1ServerClient } from "@/lib/data/d1/client";
import type { Database } from "@/lib/supabase/database.types";
import type { CalendarItem, CalendarPageModel } from "./types";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
type EventRow = Database["public"]["Tables"]["user_calendar_events"]["Row"];
const HOUR_MS = 3_600_000;

function viewerLabel(name: string | null, email: string | null, phone: string | null) { return name?.trim() || email || phone || "Student"; }
function safeTimeZone(timezone: string | null | undefined) { const value = timezone || "UTC"; try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date()); return value; } catch { return "UTC"; } }
function localMonthKey(date: Date, timezone: string) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTimeZone(timezone), year: "numeric", month: "2-digit" }).formatToParts(date); const map = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${map.year}-${map.month}`; }
function requestedMonth(month?: string | null) { if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return month; return new Date().toISOString().slice(0, 7); }
function monthUtcWindow(month: string) { const start = new Date(`${month}-01T00:00:00.000Z`); const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); return { start: new Date(start.valueOf() - 36 * HOUR_MS), end: new Date(end.valueOf() + 36 * HOUR_MS) }; }

export async function getCalendarPageModel(monthParam?: string | null): Promise<CalendarPageModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" };
  const profile = await getProfileForUser(identity.id);
  const name = viewerLabel(profile?.display_name ?? null, identity.email, identity.phone);
  if (!profile?.onboarding_completed_at || !isCALevel(profile.ca_level) || !isGroupChoice(profile.group_choice) || !profile.attempt_key || profile.attempt_key === "undecided") return { mode: "setup", viewerName: name };
  const month = requestedMonth(monthParam);
  const timezone = safeTimeZone(profile.timezone);
  const window = monthUtcWindow(month);
  const startDate = `${month}-01`;
  const nextMonth = new Date(`${month}-01T12:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1); const endDate = nextMonth.toISOString().slice(0, 10);
  const client = await createD1ServerClient();
  const [tasks, goals, userEvents, attempt] = await Promise.all([
    client.from("tasks").select("*").eq("user_id", identity.id).gte("due_at", window.start.toISOString()).lt("due_at", window.end.toISOString()).neq("status", "cancelled").order("due_at"),
    client.from("goals").select("*").eq("user_id", identity.id).gte("due_date", startDate).lt("due_date", endDate).neq("status", "cancelled").order("due_date"),
    client.from("user_calendar_events").select("*").eq("user_id", identity.id).gte("starts_at", window.start.toISOString()).lt("starts_at", window.end.toISOString()).order("starts_at"),
    client.from("exam_attempts").select("id").eq("attempt_key", profile.attempt_key).eq("verification_status", "verified").limit(1).maybeSingle(),
  ]);
  const error = tasks.error || goals.error || userEvents.error || attempt.error;
  if (error) throw new Error(`Calendar could not be loaded: ${error.message}`);
  const examEvents = attempt.data?.id ? await client.from("exam_events").select("*").eq("attempt_id", attempt.data.id).eq("verification_status", "verified").gte("event_date", startDate).lt("event_date", endDate).order("event_date") : { data: [], error: null };
  if (examEvents.error) throw new Error(`Official exam calendar could not be loaded: ${examEvents.error.message}`);
  const items: CalendarItem[] = [];
  for (const row of (tasks.data ?? []) as TaskRow[]) if (localMonthKey(new Date(row.due_at), timezone) === month) items.push({ id: `task:${row.id}`, source: "task", kind: row.task_kind as CalendarItem["kind"], title: row.title, startsAt: row.due_at, endsAt: null, allDay: false, readOnly: false, status: row.status, estimatedMinutes: row.estimated_minutes });
  for (const row of (goals.data ?? []) as GoalRow[]) items.push({ id: `goal:${row.id}`, source: "goal", kind: "goal", title: row.title, startsAt: `${row.due_date}T12:00:00`, endsAt: null, allDay: true, readOnly: false, status: row.status });
  for (const row of (userEvents.data ?? []) as EventRow[]) if (localMonthKey(new Date(row.starts_at), timezone) === month) items.push({ id: `user:${row.id}`, source: "user", kind: "personal", title: row.title, startsAt: row.starts_at, endsAt: row.ends_at, allDay: row.all_day, readOnly: false });
  for (const row of examEvents.data ?? []) items.push({ id: `icai:${row.id}`, source: "icai", kind: "exam", title: row.title, startsAt: `${row.event_date}T12:00:00`, endsAt: null, allDay: true, readOnly: true, status: "verified", sourceUrl: row.source_url });
  items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { mode: "ready", viewerName: name, month, items };
}
