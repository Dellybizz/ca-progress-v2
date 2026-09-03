import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { selectDailyCandidates } from "./ranking";
import type {
  ForecastHistoryPoint,
  ForecastPageModel,
  ForecastStatus,
  ForecastSummary,
  PlannerCandidate,
  RevisionSettings,
  RevisionSettingsPageModel,
  TodayPlanAction,
  TodayPlanItem,
  TodayPlanPageModel,
  WeakSubjectWarning,
} from "./types";

type Profile = Awaited<ReturnType<typeof getProfileForUser>>;
type RulesRow = Database["public"]["Tables"]["revision_rules"]["Row"];
type RevisionRow = Database["public"]["Tables"]["revision_due_items"]["Row"];
type PlanRow = Database["public"]["Tables"]["daily_plans"]["Row"];
type PlanItemRow = Database["public"]["Tables"]["daily_plan_items"]["Row"];
type ForecastRow = Database["public"]["Tables"]["forecast_snapshots"]["Row"];
type ProgressRow = Database["public"]["Tables"]["chapter_progress"]["Row"];
type SessionRow = Database["public"]["Tables"]["study_sessions"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type EventRow = Database["public"]["Tables"]["planner_events"]["Row"];
type AttemptRow = Database["public"]["Tables"]["exam_attempts"]["Row"];

const MEANINGFUL_EVENTS = [
  "progress_changed",
  "profile_planning_changed",
  "revision_rules_changed",
  "task_changed",
  "goal_changed",
  "study_session_completed",
] as const;

function viewerLabel(name: string | null, email: string | null, phone: string | null) {
  return name?.trim() || email || phone || "Student";
}

function validProfile(profile: Profile) {
  return Boolean(
    profile?.onboarding_completed_at &&
      isCALevel(profile.ca_level) &&
      isGroupChoice(profile.group_choice) &&
      profile.attempt_key &&
      profile.attempt_key !== "undecided",
  );
}

function dateInTimezone(timezone: string, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

function weekdayForDate(date: string) {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.valueOf() - b.valueOf()) / 86_400_000);
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function formatDate(date: Date | null) {
  return date && Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) : null;
}

function attemptMonthAnchor(attemptKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(attemptKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function rulesDto(row: RulesRow | null): RevisionSettings {
  return {
    intervalDays: row?.interval_days ?? [1, 7, 21],
    preferredWeekdays: row?.preferred_weekdays ?? [1, 2, 3, 4, 5, 6],
    revisionMinutes: row?.revision_minutes ?? 45,
    newChapterMinutes: row?.new_chapter_minutes ?? 90,
    testMinutes: row?.test_minutes ?? 60,
    updatedAt: row?.updated_at ?? null,
  };
}

async function readyContext() {
  const identity = await optionalUser();
  if (!identity) return { mode: "guest" as const };
  const profile = await getProfileForUser(identity.id);
  const viewerName = viewerLabel(profile?.display_name ?? null, identity.email, identity.phone);
  if (!validProfile(profile)) return { mode: "setup" as const, viewerName };
  const catalog = await getAcademicCatalog({
    level: profile!.ca_level!,
    group: profile!.group_choice!,
    attempt: profile!.attempt_key!,
  });
  const chapterToSubject = new Map<string, string>();
  const chapterTitles = new Map<string, string>();
  const subjectTitles = new Map<string, string>();
  for (const subject of catalog.subjects) {
    subjectTitles.set(subject.id, subject.title);
    for (const chapter of subject.chapters) {
      chapterToSubject.set(chapter.id, subject.id);
      chapterTitles.set(chapter.id, chapter.title);
    }
  }
  return {
    mode: "ready" as const,
    identity,
    profile: profile!,
    viewerName,
    catalog,
    chapterToSubject,
    chapterTitles,
    subjectTitles,
  };
}

async function ensureRules(userId: string) {
  const admin = createAdminSupabaseClient();
  const existing = await admin.from("revision_rules").select("*").eq("user_id", userId).maybeSingle();
  if (existing.error) throw new Error(`Revision settings could not be loaded: ${existing.error.message}`);
  if (existing.data) return existing.data as RulesRow;
  const created = await admin.from("revision_rules").insert({ user_id: userId }).select("*").single();
  if (created.error) throw new Error(`Revision settings could not be initialized: ${created.error.message}`);
  return created.data as RulesRow;
}

async function latestMeaningfulEvent(userId: string) {
  const admin = createAdminSupabaseClient();
  const result = await admin
    .from("planner_events")
    .select("*")
    .eq("user_id", userId)
    .in("event_type", [...MEANINGFUL_EVENTS])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(`Planner history could not be read: ${result.error.message}`);
  return (result.data ?? null) as EventRow | null;
}

async function attemptDetails(attemptKey: string, levelId: string) {
  const admin = createAdminSupabaseClient();
  const attempt = await admin
    .from("exam_attempts")
    .select("*")
    .eq("attempt_key", attemptKey)
    .eq("level_id", levelId)
    .eq("verification_status", "verified")
    .limit(1)
    .maybeSingle();
  if (attempt.error) throw new Error(`Exam attempt could not be loaded: ${attempt.error.message}`);
  const row = (attempt.data ?? null) as AttemptRow | null;
  if (row?.start_date) {
    return { label: row.label, anchor: new Date(`${row.start_date}T00:00:00.000Z`), source: "verified_exam_date" as const };
  }
  if (row?.id) {
    const event = await admin
      .from("exam_events")
      .select("event_date")
      .eq("attempt_id", row.id)
      .eq("verification_status", "verified")
      .order("event_date")
      .limit(1)
      .maybeSingle();
    if (event.error) throw new Error(`Exam event could not be loaded: ${event.error.message}`);
    if (event.data?.event_date) {
      return { label: row.label, anchor: new Date(`${event.data.event_date}T00:00:00.000Z`), source: "verified_exam_date" as const };
    }
  }
  const fallback = attemptMonthAnchor(attemptKey);
  return {
    label: row?.label ?? attemptKey,
    anchor: fallback,
    source: fallback ? ("attempt_month" as const) : ("unavailable" as const),
  };
}

function weaknessWarnings(
  subjects: { id: string; title: string; chapterIds: string[] }[],
  completed: Set<string>,
  sessions: SessionRow[],
) {
  const total = subjects.reduce((sum, subject) => sum + subject.chapterIds.length, 0);
  const overall = total ? (completed.size / total) * 100 : 0;
  const recentMinutes = new Map<string, number>();
  for (const session of sessions) {
    if (!session.subject_id) continue;
    recentMinutes.set(session.subject_id, (recentMinutes.get(session.subject_id) ?? 0) + Math.round(session.duration_seconds / 60));
  }
  const warnings: WeakSubjectWarning[] = [];
  for (const subject of subjects) {
    if (!subject.chapterIds.length) continue;
    const done = subject.chapterIds.filter((id) => completed.has(id)).length;
    const completionPercent = Math.round((done / subject.chapterIds.length) * 100);
    const studied = recentMinutes.get(subject.id) ?? 0;
    if (done < subject.chapterIds.length && (completionPercent + 15 < overall || (completionPercent < 40 && studied < 90))) {
      warnings.push({
        subjectId: subject.id,
        subjectTitle: subject.title,
        completionPercent,
        recentStudyMinutes: studied,
        reason:
          studied < 90
            ? `${subject.title} is ${completionPercent}% complete with only ${studied} recent study minutes.`
            : `${subject.title} is trailing your overall syllabus completion rate.`,
      });
    }
  }
  return warnings.sort((a, b) => a.completionPercent - b.completionPercent || a.recentStudyMinutes - b.recentStudyMinutes);
}

async function calculateForecast(
  context: Extract<Awaited<ReturnType<typeof readyContext>>, { mode: "ready" }>,
  progress: ProgressRow[],
  sessions: SessionRow[],
  sourceEventId: string | null,
  persist: boolean,
) {
  const applicableChapters = context.catalog.subjects.flatMap((subject) => subject.chapters.map((chapter) => chapter.id));
  const applicable = new Set(applicableChapters);
  const completedRows = progress.filter((row) => row.completed_at && applicable.has(row.chapter_id));
  const completed = new Set(completedRows.map((row) => row.chapter_id));
  const totalChapters = applicableChapters.length;
  const completedChapters = completed.size;
  const remainingChapters = Math.max(0, totalChapters - completedChapters);
  const attempt = await attemptDetails(context.profile.attempt_key!, context.catalog.selectedLevel.id);
  const now = new Date();
  const fourWeeksAgo = addDays(now, -28);
  const recentCompletions = completedRows.filter((row) => row.completed_at && new Date(row.completed_at) >= fourWeeksAgo).length;
  const observedChaptersPerWeek = Math.round((recentCompletions / 4) * 100) / 100;
  const target = attempt.anchor ? addDays(attempt.anchor, -30) : null;
  const effectiveTarget = target && target > now ? target : attempt.anchor;
  const daysToTarget = effectiveTarget ? Math.max(0, daysBetween(effectiveTarget, now)) : 0;
  const weeksToTarget = daysToTarget / 7;
  const requiredChaptersPerWeek = weeksToTarget > 0 ? Math.round((remainingChapters / weeksToTarget) * 100) / 100 : remainingChapters > 0 ? remainingChapters : 0;
  const projected = observedChaptersPerWeek > 0 && remainingChapters > 0 ? addDays(now, Math.ceil((remainingChapters / observedChaptersPerWeek) * 7)) : remainingChapters === 0 ? now : null;
  let status: ForecastStatus;
  let explanation: string;
  if (remainingChapters === 0) {
    status = "complete";
    explanation = "All applicable chapters are marked complete. Keep the revision schedule current until the attempt.";
  } else if (!attempt.anchor) {
    status = "no_date";
    explanation = "A reliable attempt date is unavailable, so CA Progress will rank work without claiming a completion deadline.";
  } else if (!effectiveTarget || effectiveTarget <= now) {
    status = "behind";
    explanation = `The recommended syllabus-finish buffer has passed with ${remainingChapters} chapters remaining. Prioritize overdue work and weak subjects.`;
  } else if (projected && projected <= effectiveTarget) {
    status = "on_track";
    explanation = `At your recent pace, the remaining ${remainingChapters} chapters project to finish before the recommended revision buffer.`;
  } else if (projected && projected <= attempt.anchor) {
    status = "at_risk";
    explanation = "Your recent pace can finish the syllabus before the attempt, but it leaves less revision buffer than recommended.";
  } else {
    status = "behind";
    explanation = observedChaptersPerWeek > 0
      ? "Your recent completion pace projects beyond the selected attempt. The daily plan will raise unfinished and overdue work."
      : "There is not enough recent chapter-completion pace to project an on-time finish yet.";
  }

  let row: ForecastRow | null = null;
  if (persist) {
    const admin = createAdminSupabaseClient();
    const inserted = await admin
      .from("forecast_snapshots")
      .insert({
        user_id: context.identity.id,
        attempt_key: context.profile.attempt_key!,
        attempt_anchor_date: formatDate(attempt.anchor),
        date_source: attempt.source,
        total_chapters: totalChapters,
        completed_chapters: completedChapters,
        remaining_chapters: remainingChapters,
        observed_chapters_per_week: observedChaptersPerWeek,
        required_chapters_per_week: requiredChaptersPerWeek,
        projected_completion_date: formatDate(projected),
        target_completion_date: formatDate(effectiveTarget),
        status,
        explanation,
        source_event_id: sourceEventId,
      })
      .select("*")
      .single();
    if (inserted.error) throw new Error(`Forecast could not be stored: ${inserted.error.message}`);
    row = inserted.data as ForecastRow;
  }

  const summary: ForecastSummary = {
    id: row?.id ?? null,
    attemptKey: context.profile.attempt_key!,
    attemptLabel: attempt.label,
    attemptAnchorDate: formatDate(attempt.anchor),
    dateSource: attempt.source,
    totalChapters,
    completedChapters,
    remainingChapters,
    completionPercent: totalChapters ? Math.round((completedChapters / totalChapters) * 100) : 0,
    observedChaptersPerWeek,
    requiredChaptersPerWeek,
    projectedCompletionDate: formatDate(projected),
    targetCompletionDate: formatDate(effectiveTarget),
    status,
    explanation,
    capturedAt: row?.created_at ?? null,
  };
  return { summary, completed, sessions };
}

function buildCandidates(
  context: Extract<Awaited<ReturnType<typeof readyContext>>, { mode: "ready" }>,
  planDate: string,
  rules: RevisionSettings,
  progress: ProgressRow[],
  revisions: RevisionRow[],
  tasks: TaskRow[],
  weakSubjects: WeakSubjectWarning[],
  preferredStudyDay: boolean,
) {
  const now = new Date();
  const weakIds = new Set(weakSubjects.map((subject) => subject.subjectId));
  const candidates: PlannerCandidate[] = [];

  for (const revision of revisions) {
    if (revision.status !== "pending") continue;
    const effectiveDue = new Date(revision.manual_due_at ?? revision.due_at);
    const overdueDays = Math.max(0, daysBetween(now, effectiveDue));
    if (effectiveDue > addDays(now, 1) && dateInTimezone(context.profile.timezone, effectiveDue) !== planDate) continue;
    const chapterTitle = context.chapterTitles.get(revision.chapter_id) ?? "Completed chapter";
    const subjectId = context.chapterToSubject.get(revision.chapter_id) ?? null;
    const dueToday = dateInTimezone(context.profile.timezone, effectiveDue) === planDate;
    candidates.push({
      sourceType: "revision_due",
      sourceKey: `revision:${revision.id}`,
      sourceId: revision.id,
      chapterId: revision.chapter_id,
      subjectId,
      revisionNumber: revision.revision_number,
      testNumber: null,
      title: `Revision ${revision.revision_number}: ${chapterTitle}`,
      itemKind: "revision",
      estimatedMinutes: rules.revisionMinutes,
      priorityScore: 120 + Math.min(40, overdueDays * 4) + (subjectId && weakIds.has(subjectId) ? 8 : 0),
      reasonCode: overdueDays > 0 ? "revision_overdue" : "revision_due",
      reasonText: overdueDays > 0
        ? `Revision ${revision.revision_number} is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue, so it is protected from lower-priority new work.`
        : dueToday
          ? `Revision ${revision.revision_number} is due today from your saved revision intervals.`
          : `Revision ${revision.revision_number} is due next and fits your current revision rules.`,
      urgent: overdueDays > 0 || dueToday,
      overdueDays,
    });
  }

  for (const task of tasks) {
    if (task.status !== "todo") continue;
    const due = new Date(task.due_at);
    const dueLocal = dateInTimezone(context.profile.timezone, due);
    const overdueDays = due < now ? Math.max(1, daysBetween(now, due)) : 0;
    if (dueLocal !== planDate && !overdueDays) continue;
    const subjectTitle = task.subject_id ? context.subjectTitles.get(task.subject_id) : null;
    candidates.push({
      sourceType: "task",
      sourceKey: `task:${task.id}`,
      sourceId: task.id,
      chapterId: task.chapter_id,
      subjectId: task.subject_id,
      revisionNumber: null,
      testNumber: null,
      title: task.title,
      itemKind: "task",
      estimatedMinutes: task.estimated_minutes,
      priorityScore: 108 + Math.min(35, overdueDays * 4) + (task.subject_id && weakIds.has(task.subject_id) ? 6 : 0),
      reasonCode: overdueDays ? "task_overdue" : "task_due_today",
      reasonText: overdueDays
        ? `This task is overdue by about ${overdueDays} day${overdueDays === 1 ? "" : "s"} and remains ahead of optional new work.`
        : `You scheduled this ${task.task_kind} task for today${subjectTitle ? ` in ${subjectTitle}` : ""}.`,
      urgent: true,
      overdueDays,
    });
  }

  if (!preferredStudyDay) return candidates;

  for (const subject of context.catalog.subjects) {
    for (const chapter of subject.chapters) {
      const row = progress.find((item) => item.chapter_id === chapter.id);
      if (!row?.completed_at) {
        candidates.push({
          sourceType: "chapter",
          sourceKey: `chapter:${chapter.id}`,
          sourceId: chapter.id,
          chapterId: chapter.id,
          subjectId: subject.id,
          revisionNumber: null,
          testNumber: null,
          title: `Study: ${chapter.title}`,
          itemKind: "new_chapter",
          estimatedMinutes: rules.newChapterMinutes,
          priorityScore: 60 + (weakIds.has(subject.id) ? 14 : 0),
          reasonCode: weakIds.has(subject.id) ? "weak_subject_new_work" : "remaining_syllabus",
          reasonText: weakIds.has(subject.id)
            ? `${subject.title} is currently a weaker area, so unfinished syllabus work here gets a modest priority boost.`
            : `This is unfinished syllabus work for your selected attempt and fits a preferred study day.`,
          urgent: false,
          overdueDays: 0,
        });
      } else if (!row.test_1_at) {
        candidates.push({
          sourceType: "test",
          sourceKey: `test:${chapter.id}:1`,
          sourceId: chapter.id,
          chapterId: chapter.id,
          subjectId: subject.id,
          revisionNumber: null,
          testNumber: 1,
          title: `Test 1: ${chapter.title}`,
          itemKind: "test",
          estimatedMinutes: rules.testMinutes,
          priorityScore: 84 + (weakIds.has(subject.id) ? 10 : 0),
          reasonCode: "completed_chapter_test",
          reasonText: `The chapter is complete but Test 1 is still open, so a test can strengthen recall before more new work.`,
          urgent: false,
          overdueDays: 0,
        });
      } else if (!row.test_2_at) {
        candidates.push({
          sourceType: "test",
          sourceKey: `test:${chapter.id}:2`,
          sourceId: chapter.id,
          chapterId: chapter.id,
          subjectId: subject.id,
          revisionNumber: null,
          testNumber: 2,
          title: `Test 2: ${chapter.title}`,
          itemKind: "test",
          estimatedMinutes: rules.testMinutes,
          priorityScore: 76 + (weakIds.has(subject.id) ? 8 : 0),
          reasonCode: "followup_test",
          reasonText: `Test 1 is complete and Test 2 is still open, making this a useful follow-up check when time allows.`,
          urgent: false,
          overdueDays: 0,
        });
      }
    }
  }
  return candidates;
}

function itemDto(
  row: PlanItemRow,
  context: Extract<Awaited<ReturnType<typeof readyContext>>, { mode: "ready" }>,
): TodayPlanItem {
  const scheduled = row.scheduled_at ? new Date(row.scheduled_at) : new Date(`${row.scheduled_for}T23:59:59.999Z`);
  return {
    id: row.id,
    sourceType: row.source_type as TodayPlanItem["sourceType"],
    sourceKey: row.source_key,
    sourceId: row.source_id,
    chapterId: row.chapter_id,
    subjectId: row.subject_id,
    revisionNumber: row.revision_number,
    testNumber: row.test_number,
    title: row.title,
    itemKind: row.item_kind as TodayPlanItem["itemKind"],
    estimatedMinutes: row.estimated_minutes,
    priorityScore: Number(row.priority_score),
    reasonCode: row.reason_code,
    reasonText: row.reason_text,
    status: row.status as TodayPlanItem["status"],
    scheduledFor: row.scheduled_for,
    scheduledAt: row.scheduled_at,
    manualOverride: row.manual_override,
    manualNote: row.manual_note,
    position: row.position,
    completedAt: row.completed_at,
    subjectTitle: row.subject_id ? context.subjectTitles.get(row.subject_id) ?? null : null,
    chapterTitle: row.chapter_id ? context.chapterTitles.get(row.chapter_id) ?? null : null,
    overdueDays: row.status === "planned" && scheduled < new Date() ? Math.max(0, daysBetween(new Date(), scheduled)) : 0,
  };
}

async function plannerInputs(context: Extract<Awaited<ReturnType<typeof readyContext>>, { mode: "ready" }>) {
  const admin = createAdminSupabaseClient();
  const recentSince = addDays(new Date(), -28).toISOString();
  const [progress, sessions, tasks, revisions] = await Promise.all([
    admin.from("chapter_progress").select("*").eq("user_id", context.identity.id),
    admin.from("study_sessions").select("*").eq("user_id", context.identity.id).gte("ended_at", recentSince).order("ended_at", { ascending: false }).limit(500),
    admin.from("tasks").select("*").eq("user_id", context.identity.id).neq("status", "cancelled").order("due_at").limit(500),
    admin.from("revision_due_items").select("*").eq("user_id", context.identity.id).order("due_at").limit(1000),
  ]);
  const error = progress.error || sessions.error || tasks.error || revisions.error;
  if (error) throw new Error(`Smart planner inputs could not be loaded: ${error.message}`);
  return {
    progress: (progress.data ?? []) as ProgressRow[],
    sessions: (sessions.data ?? []) as SessionRow[],
    tasks: (tasks.data ?? []) as TaskRow[],
    revisions: (revisions.data ?? []) as RevisionRow[],
  };
}

async function persistPlan(
  context: Extract<Awaited<ReturnType<typeof readyContext>>, { mode: "ready" }>,
  planDate: string,
  force: boolean,
) {
  const admin = createAdminSupabaseClient();
  const rulesRow = await ensureRules(context.identity.id);
  const rules = rulesDto(rulesRow);
  const inputs = await plannerInputs(context);
  const meaningfulEvent = await latestMeaningfulEvent(context.identity.id);
  const targetMinutes = Math.max(1, Math.min(1440, context.profile.daily_target_minutes ?? 120));
  const preferredStudyDay = rules.preferredWeekdays.includes(weekdayForDate(planDate));

  const existingPlanResult = await admin.from("daily_plans").select("*").eq("user_id", context.identity.id).eq("plan_date", planDate).maybeSingle();
  if (existingPlanResult.error) throw new Error(`Today plan could not be loaded: ${existingPlanResult.error.message}`);
  let plan = (existingPlanResult.data ?? null) as PlanRow | null;
  const stale =
    force ||
    !plan ||
    plan.attempt_key !== context.profile.attempt_key ||
    plan.timezone !== context.profile.timezone ||
    plan.target_minutes !== targetMinutes ||
    Boolean(meaningfulEvent && plan.generated_at < meaningfulEvent.created_at);

  const subjects = context.catalog.subjects.map((subject) => ({
    id: subject.id,
    title: subject.title,
    chapterIds: subject.chapters.map((chapter) => chapter.id),
  }));
  const completedSet = new Set(inputs.progress.filter((row) => row.completed_at).map((row) => row.chapter_id));
  const weakSubjects = weaknessWarnings(subjects, completedSet, inputs.sessions);

  let forecast: ForecastSummary;
  if (stale) {
    const reason = force ? "manual_refresh" : !plan ? "initial_generation" : "meaningful_event";
    const upsert = await admin
      .from("daily_plans")
      .upsert(
        {
          user_id: context.identity.id,
          plan_date: planDate,
          attempt_key: context.profile.attempt_key!,
          timezone: context.profile.timezone,
          target_minutes: targetMinutes,
          generation_reason: reason,
          generation_version: "phase9-v1",
          source_event_id: meaningfulEvent?.id ?? null,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,plan_date" },
      )
      .select("*")
      .single();
    if (upsert.error) throw new Error(`Today plan could not be generated: ${upsert.error.message}`);
    plan = upsert.data as PlanRow;

    const existingItems = await admin.from("daily_plan_items").select("*").eq("plan_id", plan.id).order("position");
    if (existingItems.error) throw new Error(`Existing plan changes could not be preserved: ${existingItems.error.message}`);
    const preserved = ((existingItems.data ?? []) as PlanItemRow[]).filter((item) => item.manual_override || item.status !== "planned");
    const blockedKeys = new Set(preserved.map((item) => item.source_key));
    const removeGenerated = await admin.from("daily_plan_items").delete().eq("plan_id", plan.id).eq("manual_override", false).eq("status", "planned");
    if (removeGenerated.error) throw new Error(`Generated suggestions could not be refreshed: ${removeGenerated.error.message}`);

    const candidates = buildCandidates(context, planDate, rules, inputs.progress, inputs.revisions, inputs.tasks, weakSubjects, preferredStudyDay);
    const selection = selectDailyCandidates(candidates, targetMinutes, blockedKeys);
    if (selection.selected.length) {
      const inserted = await admin.from("daily_plan_items").insert(
        selection.selected.map((candidate, index) => ({
          plan_id: plan!.id,
          user_id: context.identity.id,
          source_type: candidate.sourceType,
          source_key: candidate.sourceKey,
          source_id: candidate.sourceId,
          chapter_id: candidate.chapterId,
          subject_id: candidate.subjectId,
          revision_number: candidate.revisionNumber,
          test_number: candidate.testNumber,
          title: candidate.title,
          item_kind: candidate.itemKind,
          estimated_minutes: candidate.estimatedMinutes,
          priority_score: candidate.priorityScore,
          reason_code: candidate.reasonCode,
          reason_text: candidate.reasonText,
          status: "planned",
          scheduled_for: planDate,
          scheduled_at: null,
          manual_override: false,
          manual_note: null,
          position: preserved.length + index,
          completed_at: null,
        })),
      );
      if (inserted.error) throw new Error(`Plan recommendations could not be stored: ${inserted.error.message}`);
    }

    const calculated = await calculateForecast(context, inputs.progress, inputs.sessions, meaningfulEvent?.id ?? null, true);
    forecast = calculated.summary;
    await admin.from("planner_events").insert({
      user_id: context.identity.id,
      event_type: "plan_recomputed",
      entity_type: "daily_plan",
      entity_id: plan.id,
      payload: { plan_date: planDate, reason, selected_count: selection.selected.length, manual_preserved: preserved.length, over_target: selection.overTarget },
    });
  } else {
    const latestForecast = await admin
      .from("forecast_snapshots")
      .select("*")
      .eq("user_id", context.identity.id)
      .eq("attempt_key", context.profile.attempt_key!)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestForecast.error) throw new Error(`Forecast could not be loaded: ${latestForecast.error.message}`);
    if (latestForecast.data) {
      const row = latestForecast.data as ForecastRow;
      const attempt = await attemptDetails(context.profile.attempt_key!, context.catalog.selectedLevel.id);
      forecast = {
        id: row.id,
        attemptKey: row.attempt_key,
        attemptLabel: attempt.label,
        attemptAnchorDate: row.attempt_anchor_date,
        dateSource: row.date_source as ForecastSummary["dateSource"],
        totalChapters: row.total_chapters,
        completedChapters: row.completed_chapters,
        remainingChapters: row.remaining_chapters,
        completionPercent: row.total_chapters ? Math.round((row.completed_chapters / row.total_chapters) * 100) : 0,
        observedChaptersPerWeek: Number(row.observed_chapters_per_week),
        requiredChaptersPerWeek: Number(row.required_chapters_per_week),
        projectedCompletionDate: row.projected_completion_date,
        targetCompletionDate: row.target_completion_date,
        status: row.status as ForecastStatus,
        explanation: row.explanation,
        capturedAt: row.created_at,
      };
    } else {
      forecast = (await calculateForecast(context, inputs.progress, inputs.sessions, meaningfulEvent?.id ?? null, true)).summary;
    }
  }

  if (!plan) throw new Error("Today plan was not created.");
  const itemsResult = await admin.from("daily_plan_items").select("*").eq("plan_id", plan.id).order("position").order("priority_score", { ascending: false });
  if (itemsResult.error) throw new Error(`Today plan items could not be loaded: ${itemsResult.error.message}`);
  const items = ((itemsResult.data ?? []) as PlanItemRow[]).map((row) => itemDto(row, context));
  const effectivePendingRevisions = inputs.revisions.filter((row) => row.status === "pending");
  const dueRevisionCount = effectivePendingRevisions.filter((row) => dateInTimezone(context.profile.timezone, new Date(row.manual_due_at ?? row.due_at)) <= planDate).length;
  const overdueRevisionCount = effectivePendingRevisions.filter((row) => new Date(row.manual_due_at ?? row.due_at) < new Date() && dateInTimezone(context.profile.timezone, new Date(row.manual_due_at ?? row.due_at)) < planDate).length;
  const warnings: string[] = [];
  if (overdueRevisionCount) warnings.push(`${overdueRevisionCount} revision${overdueRevisionCount === 1 ? " is" : "s are"} overdue and ranked ahead of optional new work.`);
  if (!preferredStudyDay) warnings.push("Today is outside your preferred study days, so new syllabus suggestions are held back unless you add them manually.");
  const plannedMinutes = items.filter((item) => item.status === "planned").reduce((sum, item) => sum + item.estimatedMinutes, 0);
  if (plannedMinutes > targetMinutes) warnings.push("Urgent overdue work exceeds your daily target. Manual reschedule and snooze controls are available instead of silently dropping it.");
  return { plan, items, forecast, weakSubjects, warnings, preferredStudyDay, dueRevisionCount, overdueRevisionCount, plannedMinutes, targetMinutes };
}

export async function getTodayPlanPageModel(options: { force?: boolean } = {}): Promise<TodayPlanPageModel> {
  const context = await readyContext();
  if (context.mode !== "ready") return context;
  const planDate = dateInTimezone(context.profile.timezone);
  const result = await persistPlan(context, planDate, Boolean(options.force));
  return {
    mode: "ready",
    viewerName: context.viewerName,
    planDate,
    timezone: context.profile.timezone,
    targetMinutes: result.targetMinutes,
    plannedMinutes: result.plannedMinutes,
    generatedAt: result.plan.generated_at,
    preferredStudyDay: result.preferredStudyDay,
    dueRevisionCount: result.dueRevisionCount,
    overdueRevisionCount: result.overdueRevisionCount,
    items: result.items,
    warnings: result.warnings,
    weakSubjects: result.weakSubjects,
    forecast: result.forecast,
  };
}

export async function getRevisionSettingsPageModel(): Promise<RevisionSettingsPageModel> {
  const context = await readyContext();
  if (context.mode !== "ready") return context;
  return { mode: "ready", viewerName: context.viewerName, settings: rulesDto(await ensureRules(context.identity.id)) };
}

export async function getForecastPageModel(): Promise<ForecastPageModel> {
  const context = await readyContext();
  if (context.mode !== "ready") return context;
  const planDate = dateInTimezone(context.profile.timezone);
  const result = await persistPlan(context, planDate, false);
  const admin = createAdminSupabaseClient();
  const historyResult = await admin.from("forecast_snapshots").select("*").eq("user_id", context.identity.id).order("created_at", { ascending: false }).limit(12);
  if (historyResult.error) throw new Error(`Forecast history could not be loaded: ${historyResult.error.message}`);
  const history: ForecastHistoryPoint[] = ((historyResult.data ?? []) as ForecastRow[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    completedChapters: row.completed_chapters,
    totalChapters: row.total_chapters,
    status: row.status as ForecastStatus,
    projectedCompletionDate: row.projected_completion_date,
  }));
  return { mode: "ready", viewerName: context.viewerName, forecast: result.forecast, history, weakSubjects: result.weakSubjects, warnings: result.warnings };
}

export async function setRevisionSettings(input: {
  intervalDays: number[];
  preferredWeekdays: number[];
  revisionMinutes: number;
  newChapterMinutes: number;
  testMinutes: number;
}) {
  const identity = await optionalUser();
  if (!identity) throw new Error("Sign in to update revision settings.");
  const intervalDays = [...new Set(input.intervalDays.map((value) => Math.round(value)))].sort((a, b) => a - b);
  const preferredWeekdays = [...new Set(input.preferredWeekdays.map((value) => Math.round(value)))].sort((a, b) => a - b);
  if (intervalDays.length < 1 || intervalDays.length > 5 || intervalDays.some((value) => value < 1 || value > 180)) throw new Error("Use 1 to 5 revision intervals between 1 and 180 days.");
  if (preferredWeekdays.length < 1 || preferredWeekdays.length > 7 || preferredWeekdays.some((value) => value < 0 || value > 6)) throw new Error("Choose at least one valid preferred study day.");
  const server = await createServerSupabaseClient();
  const result = await server.rpc("phase9_set_revision_rules", {
    p_interval_days: intervalDays,
    p_preferred_weekdays: preferredWeekdays,
    p_revision_minutes: Math.round(input.revisionMinutes),
    p_new_chapter_minutes: Math.round(input.newChapterMinutes),
    p_test_minutes: Math.round(input.testMinutes),
  });
  if (result.error) throw new Error(result.error.message || "Revision settings could not be saved.");
  return result.data;
}

async function ownedPlanItem(userId: string, itemId: string) {
  const admin = createAdminSupabaseClient();
  const result = await admin.from("daily_plan_items").select("*").eq("id", itemId).eq("user_id", userId).maybeSingle();
  if (result.error || !result.data) throw new Error("Plan item was not found.");
  return result.data as PlanItemRow;
}

export async function performTodayPlanAction(action: TodayPlanAction) {
  const identity = await optionalUser();
  if (!identity) throw new Error("Sign in to update your plan.");
  if (action.action === "refresh") return getTodayPlanPageModel({ force: true });
  const item = await ownedPlanItem(identity.id, action.itemId);
  const admin = createAdminSupabaseClient();
  const server = await createServerSupabaseClient();
  const now = new Date().toISOString();

  if (action.action === "complete") {
    if (item.source_type === "revision_due" && item.source_id) {
      const revision = await admin.from("revision_due_items").select("*").eq("id", item.source_id).eq("user_id", identity.id).maybeSingle();
      if (revision.error || !revision.data) throw new Error("Revision item was not found.");
      const revisionRow = revision.data as RevisionRow;
      if (revisionRow.revision_number <= 2) {
        const progress = await server.rpc("progress_set_stage", { p_chapter_id: revisionRow.chapter_id, p_stage: revisionRow.revision_number === 1 ? "revision_1" : "revision_2", p_enabled: true });
        if (progress.error) throw new Error(progress.error.message);
      }
      const due = await admin.from("revision_due_items").update({ status: "completed", completed_at: now }).eq("id", revisionRow.id).eq("user_id", identity.id);
      if (due.error) throw new Error("Revision completion could not be saved.");
    } else if (item.source_type === "chapter" && item.chapter_id) {
      const progress = await server.rpc("progress_set_stage", { p_chapter_id: item.chapter_id, p_stage: "completed", p_enabled: true });
      if (progress.error) throw new Error(progress.error.message);
    } else if (item.source_type === "test" && item.chapter_id && item.test_number) {
      const progress = await server.rpc("progress_set_stage", { p_chapter_id: item.chapter_id, p_stage: item.test_number === 1 ? "test_1" : "test_2", p_enabled: true });
      if (progress.error) throw new Error(progress.error.message);
    } else if (item.source_type === "task" && item.source_id) {
      const task = await server.from("tasks").update({ status: "done", completed_at: now }).eq("id", item.source_id).eq("user_id", identity.id).select("id").maybeSingle();
      if (task.error || !task.data) throw new Error("Task completion could not be saved.");
    }
    const updated = await admin.from("daily_plan_items").update({ status: "completed", completed_at: now, manual_override: true, manual_note: "Completed by student" }).eq("id", item.id).eq("user_id", identity.id);
    if (updated.error) throw new Error("Plan completion could not be saved.");
  } else if (action.action === "skip") {
    if (item.source_type === "revision_due" && item.source_id) {
      const due = await admin.from("revision_due_items").update({ status: "skipped", completed_at: null }).eq("id", item.source_id).eq("user_id", identity.id);
      if (due.error) throw new Error("Revision skip could not be saved.");
    }
    const updated = await admin.from("daily_plan_items").update({ status: "skipped", completed_at: null, manual_override: true, manual_note: "Skipped by student" }).eq("id", item.id).eq("user_id", identity.id);
    if (updated.error) throw new Error("Plan skip could not be saved.");
  } else if (action.action === "snooze") {
    const minutes = Math.max(15, Math.min(1440, Math.round(action.minutes)));
    const scheduledAt = new Date(Date.now() + minutes * 60_000).toISOString();
    if (item.source_type === "revision_due" && item.source_id) {
      const due = await admin.from("revision_due_items").update({ manual_due_at: scheduledAt, status: "pending", completed_at: null }).eq("id", item.source_id).eq("user_id", identity.id);
      if (due.error) throw new Error("Revision snooze could not be saved.");
    }
    const updated = await admin.from("daily_plan_items").update({ scheduled_at: scheduledAt, manual_override: true, manual_note: `Snoozed ${minutes} minutes` }).eq("id", item.id).eq("user_id", identity.id);
    if (updated.error) throw new Error("Plan snooze could not be saved.");
  } else if (action.action === "reschedule") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(action.date)) throw new Error("Choose a valid reschedule date.");
    const targetDate = new Date(`${action.date}T12:00:00.000Z`);
    if (!Number.isFinite(targetDate.valueOf()) || Math.abs(daysBetween(targetDate, new Date())) > 365) throw new Error("Choose a date within one year.");
    const context = await readyContext();
    if (context.mode !== "ready" || context.identity.id !== identity.id) throw new Error("Academic profile is required to reschedule this item.");
    if (item.source_type === "revision_due" && item.source_id) {
      const due = await admin.from("revision_due_items").update({ manual_due_at: `${action.date}T12:00:00.000Z`, status: "pending", completed_at: null }).eq("id", item.source_id).eq("user_id", identity.id);
      if (due.error) throw new Error("Revision reschedule could not be saved.");
    }
    const current = await admin.from("daily_plan_items").update({ status: "rescheduled", completed_at: null, manual_override: true, manual_note: `Moved to ${action.date}` }).eq("id", item.id).eq("user_id", identity.id);
    if (current.error) throw new Error("Current plan item could not be marked rescheduled.");
    const targetPlan = await admin.from("daily_plans").upsert({ user_id: identity.id, plan_date: action.date, attempt_key: context.profile.attempt_key!, timezone: context.profile.timezone, target_minutes: Math.max(1, Math.min(1440, context.profile.daily_target_minutes ?? 120)), generation_reason: "manual_reschedule", generation_version: "phase9-v1", generated_at: now }, { onConflict: "user_id,plan_date" }).select("*").single();
    if (targetPlan.error) throw new Error("Target plan could not be created.");
    const cloned = await admin.from("daily_plan_items").upsert({ plan_id: targetPlan.data.id, user_id: identity.id, source_type: item.source_type, source_key: item.source_key, source_id: item.source_id, chapter_id: item.chapter_id, subject_id: item.subject_id, revision_number: item.revision_number, test_number: item.test_number, title: item.title, item_kind: item.item_kind, estimated_minutes: item.estimated_minutes, priority_score: item.priority_score, reason_code: "manual_reschedule", reason_text: `You moved this item from ${item.scheduled_for}; manual scheduling takes precedence over generated suggestions.`, status: "planned", scheduled_for: action.date, scheduled_at: null, manual_override: true, manual_note: `Moved from ${item.scheduled_for}`, position: item.position, completed_at: null }, { onConflict: "plan_id,source_key" });
    if (cloned.error) throw new Error("Rescheduled plan item could not be created.");
  }

  const event = await admin.from("planner_events").insert({ user_id: identity.id, event_type: "manual_plan_change", entity_type: "daily_plan_item", entity_id: item.id, payload: { action: action.action } });
  if (event.error) throw new Error("Planner history could not be recorded.");
  return { ok: true };
}


/** Queue-only planner generation. It uses the same ranking and persistence path as Today Plan,
 * but receives an explicit user id so no request cookie or page render is involved. */
export async function generateTodayPlanForUser(userId: string, planDate: string) {
  if (!/^d{4}-d{2}-d{2}$/.test(planDate)) throw new Error("Invalid plan date.");
  const profile = await getProfileForUser(userId);
  if (!validProfile(profile)) throw new Error("Student profile is not ready for plan generation.");
  const catalog = await getAcademicCatalog({ level: profile!.ca_level!, group: profile!.group_choice!, attempt: profile!.attempt_key! });
  const chapterToSubject = new Map<string, string>();
  const chapterTitles = new Map<string, string>();
  const subjectTitles = new Map<string, string>();
  for (const subject of catalog.subjects) {
    subjectTitles.set(subject.id, subject.title);
    for (const chapter of subject.chapters) {
      chapterToSubject.set(chapter.id, subject.id);
      chapterTitles.set(chapter.id, chapter.title);
    }
  }
  const context = {
    mode: "ready" as const,
    identity: { id: userId, email: null, phone: null } as NonNullable<Awaited<ReturnType<typeof optionalUser>>>,
    profile: profile!,
    viewerName: viewerLabel(profile?.display_name ?? null, null, null),
    catalog,
    chapterToSubject,
    chapterTitles,
    subjectTitles,
  };
  return persistPlan(context, planDate, true);
}
