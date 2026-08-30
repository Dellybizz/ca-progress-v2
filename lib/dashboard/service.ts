import "server-only";

import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { getProgressPageModel } from "@/lib/progress/service";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import { getDashboardAcademicReference, getDashboardLiveReference } from "./reference";
import type { DashboardPageModel, DashboardReadyModel } from "./types";

const DAY_MS = 86_400_000;

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function daysBetween(from: string, to: string) {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.ceil((toMs - fromMs) / DAY_MS);
}
function studentLabel(profileName: string | null, email: string | null, phone: string | null) { return profileName?.trim() || email || phone || "Student"; }
function groupLabel(groupChoice: string, groups: Array<{ code: string; name: string }>) {
  if (groupChoice === "both") return "Both groups";
  if (groupChoice === "not_applicable") return groups[0]?.name ?? "All papers";
  return groups.find((group) => group.code === groupChoice)?.name ?? groupChoice.replaceAll("_", " ");
}
function setupRequired(identity: { id: string }, displayName: string, generatedAt: string): DashboardPageModel {
  return { mode: "onboarding", generatedAt, viewer: { authenticated: true, id: identity.id, displayName }, reason: "profile_incomplete" };
}

export async function getDashboardPageModel(now = new Date()): Promise<DashboardPageModel> {
  const generatedAt = now.toISOString();
  const identity = await optionalUser();
  if (!identity) return { mode: "guest", generatedAt, viewer: { authenticated: false, displayName: "Guest" } };
  const profile = await getProfileForUser(identity.id);
  const displayName = studentLabel(profile?.display_name ?? null, identity.email, identity.phone);
  if (!profile?.onboarding_completed_at || !isCALevel(profile.ca_level) || !isGroupChoice(profile.group_choice) || !profile.attempt_key || profile.attempt_key === "undecided" || !profile.daily_target_minutes) {
    return setupRequired(identity, displayName, generatedAt);
  }

  const today = dateKey(now);
  const [academic, progressModel] = await Promise.all([
    getDashboardAcademicReference(profile.ca_level, profile.group_choice, profile.attempt_key),
    getProgressPageModel(),
  ]);
  if (!academic) return setupRequired(identity, displayName, generatedAt);
  if (progressModel.mode !== "ready") return setupRequired(identity, displayName, generatedAt);
  const live = await getDashboardLiveReference({ levelId: academic.level.id, levelCode: academic.level.code, attemptKey: profile.attempt_key, subjectIds: academic.subjects.map((subject) => subject.id), today });

  const upcomingExam = live.examEvents[0] ?? null;
  const targetDate = upcomingExam?.eventDate ?? live.attempt?.startDate ?? null;
  const remaining = targetDate ? daysBetween(today, targetDate) : null;
  const countdown: DashboardReadyModel["countdown"] = !targetDate
    ? { status: "awaiting_verified_date", daysRemaining: null, targetDate: null, title: live.attempt?.label ?? profile.attempt_key, sourceUrl: live.attempt?.sourceUrl ?? null, lastVerifiedAt: live.attempt?.lastVerifiedAt ?? null, sourceKind: "none" }
    : { status: remaining !== null && remaining < 0 ? "past" : "scheduled", daysRemaining: remaining !== null && remaining >= 0 ? remaining : null, targetDate, title: upcomingExam?.title ?? live.attempt?.label ?? profile.attempt_key, sourceUrl: upcomingExam?.sourceUrl ?? live.attempt?.sourceUrl ?? null, lastVerifiedAt: upcomingExam?.lastVerifiedAt ?? live.attempt?.lastVerifiedAt ?? null, sourceKind: upcomingExam ? "exam_event" : "attempt" };

  const progressGroup = new Map(progressModel.analytics.groups.map((group) => [group.code, group]));
  const progressSubject = new Map(progressModel.analytics.subjects.map((subject) => [subject.id, subject]));
  const groups = academic.groups.map((group) => {
    const subjects = academic.subjects.filter((subject) => subject.groupCode === group.code);
    return { code: group.code, name: group.name, subjectCount: subjects.length, chapterCount: subjects.reduce((sum, subject) => sum + subject.chapterCount, 0), percent: progressGroup.get(group.code)?.overallPercent ?? 0 };
  });
  const nextSubject = academic.subjects.find((subject) => (progressSubject.get(subject.id)?.overallPercent ?? 0) < 100) ?? academic.subjects[0] ?? null;

  return {
    mode: "ready",
    generatedAt,
    viewer: { authenticated: true, id: identity.id, displayName },
    context: { levelCode: academic.level.code, levelName: academic.level.name, groupChoice: profile.group_choice, groupLabel: groupLabel(profile.group_choice, academic.groups), attemptKey: profile.attempt_key, attemptLabel: live.attempt?.label ?? profile.attempt_key, subjectCount: academic.subjects.length, chapterCount: academic.totalChapters },
    countdown,
    today: { status: "awaiting_future_sources", tasks: null, revisions: null, tests: null },
    progress: {
      status: "tracked",
      overallPercent: progressModel.analytics.overallPercent,
      groups,
      subjects: academic.subjects.map((subject) => ({ ...subject, percent: progressSubject.get(subject.id)?.overallPercent ?? 0 })),
    },
    study: { status: "awaiting_phase6", dailyTargetMinutes: profile.daily_target_minutes, weeklyTargetMinutes: profile.daily_target_minutes * 7, studiedThisWeekMinutes: null, streakDays: null },
    icai: { updates: live.updates, verifiedAt: live.verifiedAt },
    alerts: [
      { kind: "revision", title: "Revision history is now tracked", description: `${progressModel.analytics.revision1Count} first and ${progressModel.analytics.revision2Count} second revisions are saved. Phase 9 will turn this history into due-revision recommendations.`, phase: 9 },
      { kind: "test", title: "Test stages are data-backed", description: `${progressModel.analytics.test1Count} Test 1 and ${progressModel.analytics.test2Count} Test 2 stages are currently recorded.`, phase: 5 },
      { kind: "streak", title: "Study streak is not tracked yet", description: "Phase 6 study sessions will supply a real consistency streak without inventing activity.", phase: 6 },
    ],
    recommendation: nextSubject ? { slot: "next_study", status: "contextual_fallback", title: `Open ${nextSubject.title}`, description: "A deterministic fallback from your current syllabus and saved progress. Phase 9 can replace this slot with explainable smart ranking.", href: `/subjects/${nextSubject.slug}/progress`, phase9Ready: true } : { slot: "next_study", status: "empty", title: "No applicable subject is published for this selection", description: "Review your level, group or attempt in profile settings. Smart planning is intentionally not generated from missing academic data.", href: "/settings/profile", phase9Ready: true },
    quickActions: [
      { key: "start_study", label: "Start Study", description: "Open focus mode", href: "/study" },
      { key: "add_task", label: "Add Task", description: "Open planner", href: "/planner?intent=add-task" },
      { key: "add_note", label: "Add Note", description: "Open notes", href: "/notes?intent=new" },
      { key: "open_progress", label: "Open Progress", description: "View tracker", href: "/progress" },
    ],
  };
}
