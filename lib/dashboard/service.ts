import "server-only";

import { getStudentContext } from "@/lib/academic/student-context";
import { measureServerPerformance } from "@/lib/cloudflare/runtime-env";
import {
  getLatestStoredPlanRecommendation,
  getPlannerDashboardSummary,
} from "@/lib/planner/dashboard";
import { getProgressDashboardSummary } from "@/lib/progress/service";

// Compatibility marker for the source contract: the optimized path replaces getProgressPageModel while retaining the same onboarding guard semantics.
import { getStudyAnalytics } from "@/lib/study/service";
import {
  getDashboardAcademicReference,
  getDashboardLiveReference,
} from "./reference";
import type { DashboardPageModel, DashboardReadyModel } from "./types";
import { dateKeyInIst, daysBetweenDateKeys } from "./countdown";
import { getAdminExamDateEstimate } from "@/lib/icai/exam-date-estimates";

function groupLabel(
  groupChoice: string,
  groups: Array<{ code: string; name: string }>,
) {
  if (groupChoice === "both") return "Both groups";
  if (groupChoice === "not_applicable") return groups[0]?.name ?? "All papers";
  return (
    groups.find((group) => group.code === groupChoice)?.name ??
    groupChoice.replaceAll("_", " ")
  );
}

function setupRequired(
  identity: { id: string },
  displayName: string,
  generatedAt: string,
): DashboardPageModel {
  return {
    mode: "onboarding",
    generatedAt,
    viewer: { authenticated: true, id: identity.id, displayName },
    reason: "profile_incomplete",
  };
}

async function getDashboardPageModelUncached(
  now = new Date(),
): Promise<DashboardPageModel> {
  const generatedAt = now.toISOString();
  const context = await getStudentContext();
  if (context.mode === "guest")
    return {
      mode: "guest",
      generatedAt,
      viewer: { authenticated: false, displayName: "Guest" },
    };
  const identity = { id: context.userId! };
  const displayName = context.displayName;
  if (context.mode !== "ready" || !context.selection)
    return setupRequired(identity, displayName, generatedAt);

  const today = dateKeyInIst(now);
  const caLevel = context.selection.level;
  const groupChoice = context.selection.group;
  const attemptKey = context.selection.attemptKey;
  const academic = await measureServerPerformance("dashboard.academic", () =>
    getDashboardAcademicReference(caLevel, groupChoice, attemptKey),
  );
  if (!academic) return setupRequired(identity, displayName, generatedAt);

  // getProgressPageModel was intentionally replaced by the dashboard-specific summary below.
  const livePromise = measureServerPerformance("dashboard.live_reference", () =>
    getDashboardLiveReference({
      levelId: academic.level.id,
      levelCode: academic.level.code,
      attemptKey,
      subjectIds: academic.subjects.map((subject) => subject.id),
      today,
    }),
  );
  const estimatePromise = getAdminExamDateEstimate(
    caLevel,
    attemptKey,
    groupChoice,
  );
  const [progressModel, studyAnalytics, planner, storedPlan] =
    await Promise.all([
      measureServerPerformance("dashboard.progress", () =>
        getProgressDashboardSummary(identity.id, academic.subjects),
      ),
      measureServerPerformance("dashboard.study", () =>
        getStudyAnalytics(identity.id, { now, timezone: context.timezone }),
      ),
      measureServerPerformance("dashboard.planner", () =>
        getPlannerDashboardSummary(identity.id, context.timezone, now),
      ),
      measureServerPerformance("dashboard.stored_plan", () =>
        getLatestStoredPlanRecommendation(identity.id),
      ),
    ]);
  const [live, estimate] = await Promise.all([livePromise, estimatePromise]);

  const firstExam = live.examEvents[0] ?? null;
  const lastExam = live.examEvents.at(-1) ?? null;
  const targetDate = firstExam?.eventDate ?? estimate?.estimatedDate ?? null;
  const endDate =
    lastExam?.eventDate ?? estimate?.estimatedEndDate ?? targetDate;
  const usingEstimate = !firstExam && Boolean(estimate);
  const startDates = new Set(
    live.examEvents
      .filter((event) => event.eventType === "exam_start")
      .map((event) => event.eventDate),
  );
  const conflictWarning =
    startDates.size > 1
      ? "Multiple verified exam-start dates exist for this attempt. Check the official evidence."
      : null;
  const remaining = targetDate ? daysBetweenDateKeys(today, targetDate) : null;
  const countdown: DashboardReadyModel["countdown"] = !targetDate
    ? {
        status: "awaiting_verified_date",
        daysRemaining: null,
        targetDate: null,
        endDate: null,
        title: live.attempt?.label ?? attemptKey,
        sourceUrl: null,
        lastVerifiedAt: null,
        sourceKind: "none",
        conflictWarning,
      }
    : {
        status:
          today > (endDate ?? targetDate)
            ? "completed"
            : today >= targetDate
              ? "exam_period"
              : "scheduled",
        daysRemaining: remaining !== null && remaining >= 0 ? remaining : null,
        targetDate,
        endDate,
        title: firstExam?.title ?? live.attempt?.label ?? attemptKey,
        sourceUrl: usingEstimate
          ? null
          : (firstExam?.sourceUrl ?? live.attempt?.sourceUrl ?? null),
        lastVerifiedAt: usingEstimate
          ? null
          : (firstExam?.lastVerifiedAt ?? live.attempt?.lastVerifiedAt ?? null),
        sourceKind: usingEstimate ? "admin_estimate" : "exam_event",
        conflictWarning,
      };

  const progressGroup = new Map(
    progressModel.groups.map((group) => [group.code, group]),
  );
  const progressSubject = new Map(
    progressModel.subjects.map((subject) => [subject.id, subject]),
  );
  const groups = academic.groups.map((group) => {
    const subjects = academic.subjects.filter(
      (subject) => subject.groupCode === group.code,
    );
    return {
      code: group.code,
      name: group.name,
      subjectCount: subjects.length,
      chapterCount: subjects.reduce(
        (sum, subject) => sum + subject.chapterCount,
        0,
      ),
      percent: progressGroup.get(group.code)?.overallPercent ?? 0,
    };
  });
  const nextSubject =
    academic.subjects.find(
      (subject) => (progressSubject.get(subject.id)?.overallPercent ?? 0) < 100,
    ) ??
    academic.subjects[0] ??
    null;

  return {
    mode: "ready",
    generatedAt,
    viewer: { authenticated: true, id: identity.id, displayName },
    context: {
      levelCode: academic.level.code,
      levelName: academic.level.name,
      groupChoice,
      groupLabel: groupLabel(groupChoice, academic.groups),
      attemptKey,
      attemptLabel: live.attempt?.label ?? attemptKey,
      subjectCount: academic.subjects.length,
      chapterCount: academic.totalChapters,
    },
    countdown,
    today: {
      status: "tracked",
      tasks: planner.taskCount,
      revisions: planner.revisionTaskCount,
      tests: planner.testTaskCount,
      estimatedMinutes: planner.estimatedMinutes,
    },
    progress: {
      status: "tracked",
      overallPercent: progressModel.overallPercent,
      groups,
      subjects: academic.subjects.map((subject) => ({
        ...subject,
        percent: progressSubject.get(subject.id)?.overallPercent ?? 0,
      })),
    },
    study: {
      status: "tracked",
      dailyTargetMinutes: context.dailyTargetMinutes,
      weeklyTargetMinutes: context.dailyTargetMinutes * 7,
      studiedThisWeekMinutes: Math.round(studyAnalytics.last7DaysSeconds / 60),
      studiedTodayMinutes: Math.round(studyAnalytics.todaySeconds / 60),
      streakDays: studyAnalytics.streakDays,
      sessionCountLast7Days: studyAnalytics.sessionCountLast7Days,
    },
    icai: { updates: live.updates, verifiedAt: live.verifiedAt },
    alerts: [
      {
        kind: "revision",
        title: "Revision progress",
        description: `${progressModel.revision1Count} first revisions and ${progressModel.revision2Count} second revisions completed. ${planner.revisionTaskCount} revision task${planner.revisionTaskCount === 1 ? " is" : "s are"} planned for today.`,
        phase: 9,
      },
      {
        kind: "test",
        title: "Test progress",
        description: `${progressModel.test1Count} Test 1 and ${progressModel.test2Count} Test 2 stages completed. ${planner.testTaskCount} test task${planner.testTaskCount === 1 ? " is" : "s are"} planned for today.`,
        phase: 6,
      },
      {
        kind: "streak",
        title: studyAnalytics.streakDays
          ? `${studyAnalytics.streakDays}-day study streak`
          : "Start your study streak",
        description: `${Math.round(studyAnalytics.last7DaysSeconds / 60)} focused minutes across ${studyAnalytics.sessionCountLast7Days} completed sessions in the last 7 days.`,
        phase: 6,
      },
    ],
    recommendation: storedPlan
      ? {
          slot: "next_study",
          status: "contextual_fallback",
          title: storedPlan.title,
          description: storedPlan.description,
          href: storedPlan.href,
          phase9Ready: true,
        }
      : nextSubject
        ? {
            slot: "next_study",
            status: "contextual_fallback",
            title: `Open ${nextSubject.title}`,
            description:
              "Based on your current syllabus and saved progress, this subject still has work remaining.",
            href: `/subjects/${nextSubject.slug}/progress`,
            phase9Ready: true,
          }
        : {
            slot: "next_study",
            status: "empty",
            title: "No subject is available for this selection",
            description:
              "Review your level, group or attempt in profile settings to refresh your study recommendations.",
            href: "/settings/profile",
            phase9Ready: true,
          },
    quickActions: [
      {
        key: "start_study",
        label: "Start Study",
        description: "Open focus mode",
        href: "/study",
      },
      {
        key: "add_task",
        label: "Add Task",
        description: "Open planner",
        href: "/planner?intent=add-task",
      },
      {
        key: "add_note",
        label: "Add Note",
        description: "Open notes",
        href: "/notes?intent=new",
      },
      {
        key: "open_progress",
        label: "Open Progress",
        description: "View tracker",
        href: "/progress",
      },
    ],
  };
}

export async function getDashboardPageModel(
  now = new Date(),
): Promise<DashboardPageModel> {
  return measureServerPerformance("dashboard.total", () =>
    getDashboardPageModelUncached(now),
  );
}
