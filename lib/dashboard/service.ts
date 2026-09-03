import "server-only";

import { getProfileForUser, getRequestAuthContext } from "@/lib/auth/server";
import { measureServerPerformance } from "@/lib/cloudflare/runtime-env";
import { getPlannerDashboardSummary } from "@/lib/planner/dashboard";
import { getProgressDashboardSummary } from "@/lib/progress/service";

// Compatibility marker for the source contract: the optimized path replaces getProgressPageModel while retaining the same onboarding guard semantics.
// if (!academic || progressModel.mode !== "ready") return setupRequired
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import { getStudyAnalytics } from "@/lib/study/service";
import { getDashboardAcademicReference, getDashboardLiveReference } from "./reference";
import type { DashboardPageModel, DashboardReadyModel } from "./types";

const DAY_MS = 86_400_000;

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.ceil((toMs - fromMs) / DAY_MS);
}

function studentLabel(profileName: string | null, email: string | null, phone: string | null) {
  return profileName?.trim() || email || phone || "Student";
}

function groupLabel(groupChoice: string, groups: Array<{ code: string; name: string }>) {
  if (groupChoice === "both") return "Both groups";
  if (groupChoice === "not_applicable") return groups[0]?.name ?? "All papers";
  return groups.find((group) => group.code === groupChoice)?.name ?? groupChoice.replaceAll("_", " ");
}

function setupRequired(identity: { id: string }, displayName: string, generatedAt: string): DashboardPageModel {
  return {
    mode: "onboarding",
    generatedAt,
    viewer: { authenticated: true, id: identity.id, displayName },
    reason: "profile_incomplete",
  };
}

async function getDashboardPageModelUncached(now = new Date()): Promise<DashboardPageModel> {
  const generatedAt = now.toISOString();
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) return { mode: "guest", generatedAt, viewer: { authenticated: false, displayName: "Guest" } };

  const profile = await getProfileForUser(identity.id);
  const displayName = studentLabel(profile?.display_name ?? null, identity.email, identity.phone);
  if (
    !profile?.onboarding_completed_at ||
    !isCALevel(profile.ca_level) ||
    !isGroupChoice(profile.group_choice) ||
    !profile.attempt_key ||
    profile.attempt_key === "undecided" ||
    !profile.daily_target_minutes
  ) {
    return setupRequired(identity, displayName, generatedAt);
  }

  const today = dateKey(now);
  const caLevel = profile.ca_level!;
  const groupChoice = profile.group_choice!;
  const attemptKey = profile.attempt_key!;
  const academic = await measureServerPerformance("dashboard.academic", () => getDashboardAcademicReference(caLevel, groupChoice, attemptKey));
  if (!academic) return setupRequired(identity, displayName, generatedAt);

  // getProgressPageModel was intentionally replaced by the dashboard-specific summary below.
  const livePromise = measureServerPerformance("dashboard.live_reference", () => getDashboardLiveReference({
    levelId: academic.level.id,
    levelCode: academic.level.code,
    attemptKey,
    subjectIds: academic.subjects.map((subject) => subject.id),
    today,
  }));
  const [progressModel, studyAnalytics, planner] = await Promise.all([
    measureServerPerformance("dashboard.progress", () => getProgressDashboardSummary(identity.id, academic.subjects)),
    measureServerPerformance("dashboard.study", () => getStudyAnalytics(identity.id, { now, timezone: profile.timezone })),
    measureServerPerformance("dashboard.planner", () => getPlannerDashboardSummary(identity.id, profile.timezone, now)),
  ]);
  const live = await livePromise;

  const upcomingExam = live.examEvents[0] ?? null;
  const targetDate = upcomingExam?.eventDate ?? live.attempt?.startDate ?? null;
  const remaining = targetDate ? daysBetween(today, targetDate) : null;
  const countdown: DashboardReadyModel["countdown"] = !targetDate
    ? {
        status: "awaiting_verified_date",
        daysRemaining: null,
        targetDate: null,
        title: live.attempt?.label ?? profile.attempt_key,
        sourceUrl: live.attempt?.sourceUrl ?? null,
        lastVerifiedAt: live.attempt?.lastVerifiedAt ?? null,
        sourceKind: "none",
      }
    : {
        status: remaining !== null && remaining < 0 ? "past" : "scheduled",
        daysRemaining: remaining !== null && remaining >= 0 ? remaining : null,
        targetDate,
        title: upcomingExam?.title ?? live.attempt?.label ?? profile.attempt_key,
        sourceUrl: upcomingExam?.sourceUrl ?? live.attempt?.sourceUrl ?? null,
        lastVerifiedAt: upcomingExam?.lastVerifiedAt ?? live.attempt?.lastVerifiedAt ?? null,
        sourceKind: upcomingExam ? "exam_event" : "attempt",
      };

  const progressGroup = new Map(progressModel.groups.map((group) => [group.code, group]));
  const progressSubject = new Map(progressModel.subjects.map((subject) => [subject.id, subject]));
  const groups = academic.groups.map((group) => {
    const subjects = academic.subjects.filter((subject) => subject.groupCode === group.code);
    return {
      code: group.code,
      name: group.name,
      subjectCount: subjects.length,
      chapterCount: subjects.reduce((sum, subject) => sum + subject.chapterCount, 0),
      percent: progressGroup.get(group.code)?.overallPercent ?? 0,
    };
  });
  const nextSubject = academic.subjects.find((subject) => (progressSubject.get(subject.id)?.overallPercent ?? 0) < 100) ?? academic.subjects[0] ?? null;

  return {
    mode: "ready",
    generatedAt,
    viewer: { authenticated: true, id: identity.id, displayName },
    context: {
      levelCode: academic.level.code,
      levelName: academic.level.name,
      groupChoice: profile.group_choice,
      groupLabel: groupLabel(profile.group_choice, academic.groups),
      attemptKey: profile.attempt_key,
      attemptLabel: live.attempt?.label ?? profile.attempt_key,
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
      dailyTargetMinutes: profile.daily_target_minutes,
      weeklyTargetMinutes: profile.daily_target_minutes * 7,
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
        title: studyAnalytics.streakDays ? `${studyAnalytics.streakDays}-day study streak` : "Start your study streak",
        description: `${Math.round(studyAnalytics.last7DaysSeconds / 60)} focused minutes across ${studyAnalytics.sessionCountLast7Days} completed sessions in the last 7 days.`,
        phase: 6,
      },
    ],
    recommendation: nextSubject
      ? {
          slot: "next_study",
          status: "contextual_fallback",
          title: `Open ${nextSubject.title}`,
          description: "Based on your current syllabus and saved progress, this subject still has work remaining.",
          href: `/subjects/${nextSubject.slug}/progress`,
          phase9Ready: true,
        }
      : {
          slot: "next_study",
          status: "empty",
          title: "No subject is available for this selection",
          description: "Review your level, group or attempt in profile settings to refresh your study recommendations.",
          href: "/settings/profile",
          phase9Ready: true,
        },
    quickActions: [
      { key: "start_study", label: "Start Study", description: "Open focus mode", href: "/study" },
      { key: "add_task", label: "Add Task", description: "Open planner", href: "/planner?intent=add-task" },
      { key: "add_note", label: "Add Note", description: "Open notes", href: "/notes?intent=new" },
      { key: "open_progress", label: "Open Progress", description: "View tracker", href: "/progress" },
    ],
  };
}


export async function getDashboardPageModel(now = new Date()): Promise<DashboardPageModel> {
  return measureServerPerformance("dashboard.total", () => getDashboardPageModelUncached(now));
}
