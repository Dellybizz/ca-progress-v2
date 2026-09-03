import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { StudySubjectOption } from "@/lib/study/types";
import type { ActivityItem, ActivityPageModel, CalendarItem, CalendarPageModel, GoalsPageModel, PlannerGoal, PlannerPageModel, PlannerTask } from "./types";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
type EventRow = Database["public"]["Tables"]["user_calendar_events"]["Row"];
type SessionRow = Database["public"]["Tables"]["study_sessions"]["Row"];
type ProgressEventRow = Database["public"]["Tables"]["progress_events"]["Row"];

function viewerLabel(name: string | null, email: string | null, phone: string | null) { return name?.trim() || email || phone || "Student"; }
function validProfile(profile: Awaited<ReturnType<typeof getProfileForUser>>) {
  return Boolean(profile?.onboarding_completed_at && isCALevel(profile.ca_level) && isGroupChoice(profile.group_choice) && profile.attempt_key && profile.attempt_key !== "undecided");
}

async function academicOptions(profile: NonNullable<Awaited<ReturnType<typeof getProfileForUser>>>) {
  if (!isCALevel(profile.ca_level) || !isGroupChoice(profile.group_choice) || !profile.attempt_key) return [] as StudySubjectOption[];
  const catalog = await getAcademicCatalog({ level: profile.ca_level, group: profile.group_choice, attempt: profile.attempt_key });
  return catalog.subjects.map((subject) => ({ id: subject.id, slug: subject.slug, title: subject.title, chapters: subject.chapters.map((chapter) => ({ id: chapter.id, number: chapter.number, title: chapter.title })) }));
}

function maps(subjects: StudySubjectOption[]) {
  return {
    subjects: new Map(subjects.map((subject) => [subject.id, subject.title])),
    chapters: new Map(subjects.flatMap((subject) => subject.chapters.map((chapter) => [chapter.id, chapter.title] as const))),
  };
}

function taskDto(row: TaskRow, subjectNames: Map<string, string>, chapterNames: Map<string, string>): PlannerTask {
  return { id: row.id, title: row.title, notes: row.notes, taskKind: row.task_kind as PlannerTask["taskKind"], subjectId: row.subject_id, chapterId: row.chapter_id, subjectTitle: row.subject_id ? subjectNames.get(row.subject_id) ?? null : null, chapterTitle: row.chapter_id ? chapterNames.get(row.chapter_id) ?? null : null, dueAt: row.due_at, estimatedMinutes: row.estimated_minutes, status: row.status as PlannerTask["status"], completedAt: row.completed_at };
}
function goalDto(row: GoalRow): PlannerGoal { return { id: row.id, title: row.title, description: row.description, dueDate: row.due_date, status: row.status as PlannerGoal["status"], completedAt: row.completed_at }; }

export async function getPlannerPageModel(): Promise<PlannerPageModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" };
  const profile = await getProfileForUser(identity.id);
  const name = viewerLabel(profile?.display_name ?? null, identity.email, identity.phone);
  if (!validProfile(profile)) return { mode: "setup", viewerName: name };
  const subjects = await academicOptions(profile!);
  const names = maps(subjects);
  const supabase = await createServerSupabaseClient();
  const [tasks, goals] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", identity.id).neq("status", "cancelled").order("due_at").limit(250),
    supabase.from("goals").select("*").eq("user_id", identity.id).neq("status", "cancelled").order("due_date").limit(100),
  ]);
  const error = tasks.error || goals.error;
  if (error) throw new Error(`Planner could not be loaded: ${error.message}`);
  return { mode: "ready", viewerName: name, subjects, tasks: ((tasks.data ?? []) as TaskRow[]).map((row) => taskDto(row, names.subjects, names.chapters)), goals: ((goals.data ?? []) as GoalRow[]).map(goalDto) };
}

export async function getGoalsPageModel(): Promise<GoalsPageModel> {
  const model = await getPlannerPageModel();
  if (model.mode !== "ready") return model;
  return { mode: "ready", viewerName: model.viewerName, goals: model.goals };
}

function monthBounds(month?: string | null) {
  const now = new Date();
  const parsed = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01T00:00:00.000Z` : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const start = new Date(parsed);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { month: start.toISOString().slice(0, 7), start, end };
}

export async function getCalendarPageModel(month?: string | null): Promise<CalendarPageModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" };
  const profile = await getProfileForUser(identity.id);
  const name = viewerLabel(profile?.display_name ?? null, identity.email, identity.phone);
  if (!validProfile(profile)) return { mode: "setup", viewerName: name };
  const bounds = monthBounds(month);
  const supabase = await createServerSupabaseClient();
  const [tasks, goals, userEvents, attempt] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", identity.id).gte("due_at", bounds.start.toISOString()).lt("due_at", bounds.end.toISOString()).neq("status", "cancelled").order("due_at"),
    supabase.from("goals").select("*").eq("user_id", identity.id).gte("due_date", bounds.start.toISOString().slice(0, 10)).lt("due_date", bounds.end.toISOString().slice(0, 10)).neq("status", "cancelled").order("due_date"),
    supabase.from("user_calendar_events").select("*").eq("user_id", identity.id).gte("starts_at", bounds.start.toISOString()).lt("starts_at", bounds.end.toISOString()).order("starts_at"),
    supabase.from("exam_attempts").select("id").eq("attempt_key", profile!.attempt_key!).eq("verification_status", "verified").limit(1).maybeSingle(),
  ]);
  const error = tasks.error || goals.error || userEvents.error || attempt.error;
  if (error) throw new Error(`Calendar could not be loaded: ${error.message}`);
  const examEvents = attempt.data?.id ? await supabase.from("exam_events").select("*").eq("attempt_id", attempt.data.id).eq("verification_status", "verified").gte("event_date", bounds.start.toISOString().slice(0, 10)).lt("event_date", bounds.end.toISOString().slice(0, 10)).order("event_date") : { data: [], error: null };
  if (examEvents.error) throw new Error(`Official exam calendar could not be loaded: ${examEvents.error.message}`);
  const items: CalendarItem[] = [];
  for (const row of (tasks.data ?? []) as TaskRow[]) items.push({ id: `task:${row.id}`, source: "task", kind: row.task_kind as CalendarItem["kind"], title: row.title, startsAt: row.due_at, endsAt: null, allDay: false, readOnly: false, status: row.status, estimatedMinutes: row.estimated_minutes });
  for (const row of (goals.data ?? []) as GoalRow[]) items.push({ id: `goal:${row.id}`, source: "goal", kind: "goal", title: row.title, startsAt: `${row.due_date}T12:00:00.000Z`, endsAt: null, allDay: true, readOnly: false, status: row.status });
  for (const row of (userEvents.data ?? []) as EventRow[]) items.push({ id: `user:${row.id}`, source: "user", kind: "personal", title: row.title, startsAt: row.starts_at, endsAt: row.ends_at, allDay: row.all_day, readOnly: false });
  for (const row of examEvents.data ?? []) items.push({ id: `icai:${row.id}`, source: "icai", kind: "exam", title: row.title, startsAt: `${row.event_date}T00:00:00.000Z`, endsAt: null, allDay: true, readOnly: true, status: "verified", sourceUrl: row.source_url });
  items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { mode: "ready", viewerName: name, month: bounds.month, items };
}

export async function getActivityPageModel(): Promise<ActivityPageModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" };
  const profile = await getProfileForUser(identity.id);
  const name = viewerLabel(profile?.display_name ?? null, identity.email, identity.phone);
  const subjects = validProfile(profile) ? await academicOptions(profile!) : [];
  const names = maps(subjects);
  const supabase = await createServerSupabaseClient();
  const [sessions, progress] = await Promise.all([
    supabase.from("study_sessions").select("id,subject_id,chapter_id,ended_at,duration_seconds").eq("user_id", identity.id).order("ended_at", { ascending: false }).limit(40),
    supabase.from("progress_events").select("id,chapter_id,stage,action,created_at,undone_at").eq("user_id", identity.id).order("created_at", { ascending: false }).limit(40),
  ]);
  const error = sessions.error || progress.error;
  if (error) throw new Error(`Activity could not be loaded: ${error.message}`);
  const items: ActivityItem[] = [];
  for (const row of (sessions.data ?? []) as SessionRow[]) {
    const subject = row.subject_id ? names.subjects.get(row.subject_id) : null;
    const chapter = row.chapter_id ? names.chapters.get(row.chapter_id) : null;
    items.push({ id: `study:${row.id}`, source: "study", occurredAt: row.ended_at, title: `Studied ${Math.max(1, Math.round(row.duration_seconds / 60))} min`, description: chapter ?? subject ?? "General study session", href: "/study" });
  }
  const stageLabel: Record<string, string> = { completed: "Completed", revision_1: "Revision 1", revision_2: "Revision 2", test_1: "Test 1", test_2: "Test 2" };
  for (const row of (progress.data ?? []) as ProgressEventRow[]) items.push({ id: `progress:${row.id}`, source: "progress", occurredAt: row.created_at, title: `${row.action === "clear" ? "Cleared" : row.action === "undo" ? "Undid" : "Saved"} ${stageLabel[row.stage] ?? row.stage}`, description: names.chapters.get(row.chapter_id) ?? "Chapter progress", href: "/progress" });
  items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return { mode: "ready", viewerName: name, items: items.slice(0, 60) };
}
