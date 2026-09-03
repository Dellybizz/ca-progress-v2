import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import { createServerSupabaseClient, isCloudflareDataRuntime } from "@/lib/supabase/server";
import { getHotStudySessions, getHotStudyTimer } from "@/lib/data/d1/hot-screens";
import type { Database } from "@/lib/supabase/database.types";
import type { StudyAnalytics, StudyPageModel, StudySessionItem, StudySubjectOption, StudyTimerSnapshot } from "./types";

type SessionRow = Database["public"]["Tables"]["study_sessions"]["Row"];
type TimerRow = Database["public"]["Tables"]["study_timer_state"]["Row"];
const DAY_MS = 86_400_000;

function safeTimeZone(timezone: string | null | undefined) {
  if (!timezone) return "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date()); return timezone; } catch { return "UTC"; }
}

function localDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTimeZone(timezone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function groupLabel(groupChoice: string, groups: Array<{ code: string; name: string }>) {
  if (groupChoice === "both") return "Both groups";
  if (groupChoice === "not_applicable") return groups[0]?.name ?? "All papers";
  return groups.find((group) => group.code === groupChoice)?.name ?? groupChoice.replaceAll("_", " ");
}

function viewerLabel(name: string | null, email: string | null, phone: string | null) {
  return name?.trim() || email || phone || "Student";
}

function elapsedTimer(row: TimerRow, now: Date) {
  const running = row.status === "running" && row.running_since ? Math.max(0, Math.floor((now.valueOf() - Date.parse(row.running_since)) / 1000)) : 0;
  return Math.min(43_200, Math.max(0, row.elapsed_seconds + running));
}

function dayDistance(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function streakDays(dayKeys: string[], today: string) {
  const days = [...new Set(dayKeys)].sort().reverse();
  if (!days.length || dayDistance(days[0], today) > 1) return 0;
  let streak = 1;
  for (let index = 1; index < days.length; index += 1) {
    if (dayDistance(days[index], days[index - 1]) !== 1) break;
    streak += 1;
  }
  return streak;
}

function sessionItem(row: SessionRow, subjectNames: Map<string, string>, chapterNames: Map<string, string>): StudySessionItem {
  return {
    id: row.id,
    subjectId: row.subject_id,
    chapterId: row.chapter_id,
    subjectTitle: row.subject_id ? subjectNames.get(row.subject_id) ?? null : null,
    chapterTitle: row.chapter_id ? chapterNames.get(row.chapter_id) ?? null : null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    mode: row.mode as StudySessionItem["mode"],
    timezone: row.timezone,
  };
}

export async function getStudyAnalytics(userId: string, options?: { now?: Date; subjectNames?: Map<string, string>; chapterNames?: Map<string, string>; timezone?: string }): Promise<StudyAnalytics> {
  const now = options?.now ?? new Date();
  const since = new Date(now.valueOf() - 60 * DAY_MS).toISOString();
  const rows = (isCloudflareDataRuntime()
    ? await getHotStudySessions(userId, since)
    : (await createServerSupabaseClient()).from("study_sessions").select("id,subject_id,chapter_id,started_at,ended_at,duration_seconds,mode,timezone").eq("user_id", userId).gte("ended_at", since).order("ended_at", { ascending: false }).limit(600).then((response) => {
      if (response.error) throw new Error(`Study analytics could not be loaded: ${response.error.message}`);
      return response.data ?? [];
    })) as SessionRow[];
  const subjectNames = options?.subjectNames ?? new Map<string, string>();
  const chapterNames = options?.chapterNames ?? new Map<string, string>();
  const timezone = safeTimeZone(options?.timezone ?? rows[0]?.timezone ?? "UTC");
  const today = localDateKey(now, timezone);
  const sevenDayCutoff = now.valueOf() - 7 * DAY_MS;
  const last7 = rows.filter((row) => Date.parse(row.ended_at) >= sevenDayCutoff);
  const localKeys = rows.map((row) => localDateKey(new Date(row.ended_at), row.timezone || timezone));
  const dailyMap = new Map<string, number>();
  for (const row of last7) {
    const key = localDateKey(new Date(row.ended_at), row.timezone || timezone);
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + row.duration_seconds);
  }
  const daily = [...dailyMap.entries()].map(([date, seconds]) => ({ date, seconds })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    todaySeconds: rows.filter((row) => localDateKey(new Date(row.ended_at), row.timezone || timezone) === today).reduce((sum, row) => sum + row.duration_seconds, 0),
    last7DaysSeconds: last7.reduce((sum, row) => sum + row.duration_seconds, 0),
    sessionCountLast7Days: last7.length,
    streakDays: streakDays(localKeys, today),
    daily,
    recentSessions: rows.slice(0, 10).map((row) => sessionItem(row, subjectNames, chapterNames)),
  };
}

export async function getStudyPageModel(now = new Date()): Promise<StudyPageModel> {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" };
  const profile = await getProfileForUser(identity.id);
  const name = viewerLabel(profile?.display_name ?? null, identity.email, identity.phone);
  if (!profile?.onboarding_completed_at || !isCALevel(profile.ca_level) || !isGroupChoice(profile.group_choice) || !profile.attempt_key || profile.attempt_key === "undecided") return { mode: "setup", viewerName: name };

  const catalog = await getAcademicCatalog({ level: profile.ca_level, group: profile.group_choice, attempt: profile.attempt_key });
  const subjects: StudySubjectOption[] = catalog.subjects.map((subject) => ({ id: subject.id, slug: subject.slug, title: subject.title, chapters: subject.chapters.map((chapter) => ({ id: chapter.id, number: chapter.number, title: chapter.title })) }));
  const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.title]));
  const chapterNames = new Map(subjects.flatMap((subject) => subject.chapters.map((chapter) => [chapter.id, chapter.title] as const)));
  const timerRow = (isCloudflareDataRuntime()
    ? await getHotStudyTimer(identity.id)
    : await (async () => {
      const response = await (await createServerSupabaseClient()).from("study_timer_state").select("*").eq("user_id", identity.id).maybeSingle();
      if (response.error) throw new Error(`Study timer could not be loaded: ${response.error.message}`);
      return response.data;
    })()) as TimerRow | null;
  const analytics = await getStudyAnalytics(identity.id, { now, subjectNames, chapterNames, timezone: timerRow?.timezone });
  const timer: StudyTimerSnapshot | null = timerRow ? {
    status: timerRow.status as StudyTimerSnapshot["status"],
    mode: timerRow.mode as StudyTimerSnapshot["mode"],
    subjectId: timerRow.subject_id,
    chapterId: timerRow.chapter_id,
    subjectTitle: timerRow.subject_id ? subjectNames.get(timerRow.subject_id) ?? null : null,
    chapterTitle: timerRow.chapter_id ? chapterNames.get(timerRow.chapter_id) ?? null : null,
    focusTargetSeconds: timerRow.focus_target_seconds,
    breakTargetSeconds: timerRow.break_target_seconds,
    startedAt: timerRow.started_at,
    runningSince: timerRow.running_since,
    elapsedSeconds: elapsedTimer(timerRow, now),
    pausedAt: timerRow.paused_at,
    timezone: timerRow.timezone,
    lastInteractionAt: timerRow.last_interaction_at,
    abandoned: timerRow.status === "running" && now.valueOf() - Date.parse(timerRow.last_interaction_at) > 16 * 60 * 60 * 1000,
  } : null;
  return { mode: "ready", viewerName: name, levelName: catalog.selectedLevel.name, groupLabel: groupLabel(profile.group_choice, catalog.groups), attemptKey: profile.attempt_key, subjects, timer, analytics };
}

export async function getStudyDashboardSummary(userId: string, now = new Date()) {
  const analytics = await getStudyAnalytics(userId, { now });
  return {
    studiedLast7DaysMinutes: Math.round(analytics.last7DaysSeconds / 60),
    studiedTodayMinutes: Math.round(analytics.todaySeconds / 60),
    streakDays: analytics.streakDays,
    sessionCountLast7Days: analytics.sessionCountLast7Days,
  };
}
