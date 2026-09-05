import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getProfileForUser, getRequestAuthContext } from "@/lib/auth/server";
import { getHotProgressRows, getHotDashboardProgress } from "@/lib/data/d1/hot-screens";
import { isCALevel, isGroupChoice } from "@/lib/profile/validation";
import type { Database } from "@/lib/supabase/database.types";
import type {
  ProgressAnalytics,
  ProgressChapter,
  ProgressGroupSummary,
  ProgressHistoryItem,
  ProgressPageModel,
  ProgressReadyModel,
  ProgressState,
  ProgressSubjectSummary,
} from "./types";

type ProgressRow = Database["public"]["Tables"]["chapter_progress"]["Row"];
type EventRow = Database["public"]["Tables"]["progress_events"]["Row"];

const EMPTY_STATE: ProgressState = {
  completed_at: null,
  revision_1_at: null,
  revision_2_at: null,
  test_1_at: null,
  test_2_at: null,
};

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function overallPercent(rows: ProgressState[]) {
  if (!rows.length) return 0;
  const achieved = rows.reduce((sum, row) => sum + Number(Boolean(row.completed_at)) + Number(Boolean(row.revision_1_at)) + Number(Boolean(row.revision_2_at)) + Number(Boolean(row.test_1_at)) + Number(Boolean(row.test_2_at)), 0);
  return percent(achieved, rows.length * 5);
}

function stateFromRow(row?: ProgressRow | null): ProgressState {
  if (!row) return { ...EMPTY_STATE };
  return {
    completed_at: row.completed_at,
    revision_1_at: row.revision_1_at,
    revision_2_at: row.revision_2_at,
    test_1_at: row.test_1_at,
    test_2_at: row.test_2_at,
  };
}

function subjectSummary(chapters: ProgressChapter[]): ProgressSubjectSummary[] {
  const bySubject = new Map<string, ProgressChapter[]>();
  for (const chapter of chapters) bySubject.set(chapter.subjectId, [...(bySubject.get(chapter.subjectId) ?? []), chapter]);
  return [...bySubject.values()].map((items) => {
    const first = items[0];
    const states = items.map((item) => item.state);
    const completedCount = states.filter((state) => state.completed_at).length;
    const revisions = states.filter((state) => state.revision_1_at).length + states.filter((state) => state.revision_2_at).length;
    const tests = states.filter((state) => state.test_1_at).length + states.filter((state) => state.test_2_at).length;
    return {
      id: first.subjectId,
      title: first.subjectTitle,
      slug: first.subjectSlug,
      groupCode: first.groupCode,
      groupName: first.groupName,
      chapterCount: items.length,
      completedCount,
      completionPercent: percent(completedCount, items.length),
      revisionPercent: percent(revisions, items.length * 2),
      testPercent: percent(tests, items.length * 2),
      overallPercent: overallPercent(states),
    };
  });
}

function groupSummary(chapters: ProgressChapter[]): ProgressGroupSummary[] {
  const byGroup = new Map<string, ProgressChapter[]>();
  for (const chapter of chapters) byGroup.set(chapter.groupCode, [...(byGroup.get(chapter.groupCode) ?? []), chapter]);
  return [...byGroup.values()].map((items) => ({
    code: items[0].groupCode,
    name: items[0].groupName,
    chapterCount: items.length,
    completedCount: items.filter((item) => item.state.completed_at).length,
    overallPercent: overallPercent(items.map((item) => item.state)),
  }));
}

function buildAnalytics(chapters: ProgressChapter[], events: EventRow[], now = new Date()): ProgressAnalytics {
  const states = chapters.map((chapter) => chapter.state);
  const completedCount = states.filter((state) => state.completed_at).length;
  const revision1Count = states.filter((state) => state.revision_1_at).length;
  const revision2Count = states.filter((state) => state.revision_2_at).length;
  const test1Count = states.filter((state) => state.test_1_at).length;
  const test2Count = states.filter((state) => state.test_2_at).length;
  const weekStart = now.valueOf() - 7 * 86_400_000;
  const activeEvents = events.filter((event) => event.action === "set" && !event.undone_at && Date.parse(event.created_at) >= weekStart);
  const activeDays = new Set(activeEvents.map((event) => event.created_at.slice(0, 10)));
  return {
    chapterCount: chapters.length,
    completedCount,
    completionPercent: percent(completedCount, chapters.length),
    revision1Count,
    revision2Count,
    revisionPercent: percent(revision1Count + revision2Count, chapters.length * 2),
    test1Count,
    test2Count,
    testPercent: percent(test1Count + test2Count, chapters.length * 2),
    overallPercent: overallPercent(states),
    stagesAddedLast7Days: activeEvents.length,
    activeDaysLast7Days: activeDays.size,
    subjects: subjectSummary(chapters),
    groups: groupSummary(chapters),
  };
}

function viewerLabel(profileName: string | null, email: string | null, phone: string | null) {
  return profileName?.trim() || email || phone || "Student";
}

function groupLabel(groupChoice: string, groups: Array<{ code: string; name: string }>) {
  if (groupChoice === "both") return "Both groups";
  if (groupChoice === "not_applicable") return groups[0]?.name ?? "All papers";
  return groups.find((group) => group.code === groupChoice)?.name ?? groupChoice.replaceAll("_", " ");
}

export async function getProgressPageModel(subjectSlug?: string | null): Promise<ProgressPageModel> {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) return { mode: "guest" };
  const profile = await getProfileForUser(identity.id);
  const name = viewerLabel(profile?.display_name ?? null, identity.email, identity.phone);
  if (!profile?.onboarding_completed_at || !isCALevel(profile.ca_level) || !isGroupChoice(profile.group_choice) || !profile.attempt_key || profile.attempt_key === "undecided") return { mode: "setup", viewerName: name };

  const catalog = await getAcademicCatalog({ level: profile.ca_level, group: profile.group_choice, attempt: profile.attempt_key });
  const subjects = subjectSlug ? catalog.subjects.filter((subject) => subject.slug === subjectSlug) : catalog.subjects;
  const chapterIds = subjects.flatMap((subject) => subject.chapters.map((chapter) => chapter.id));
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const hot = await getHotProgressRows(identity.id, chapterIds, sevenDaysAgo);
  const rowByChapter = new Map(hot.progress.map((row) => [row.chapter_id, row]));
  const groupsById = new Map(catalog.groups.map((group) => [group.id, group]));
  const chapters: ProgressChapter[] = subjects.flatMap((subject) => {
    const group = groupsById.get(subject.groupId);
    return subject.chapters.map((chapter) => ({ id: chapter.id, number: chapter.number, title: chapter.title, subjectId: subject.id, subjectTitle: subject.title, subjectSlug: subject.slug, groupCode: group?.code ?? "all", groupName: group?.name ?? "All papers", state: stateFromRow(rowByChapter.get(chapter.id) as ProgressRow | undefined), updatedAt: rowByChapter.get(chapter.id)?.updated_at ?? null }));
  });
  const titleByChapter = new Map(chapters.map((chapter) => [chapter.id, chapter.title]));
  return { mode: "ready", viewerName: name, levelName: catalog.selectedLevel.name, attemptKey: profile.attempt_key, groupLabel: groupLabel(profile.group_choice, catalog.groups), chapters, analytics: buildAnalytics(chapters, hot.weeklyEvents as EventRow[]), history: (hot.events as EventRow[]).slice(0, 20).map((event) => ({ id: event.id, chapterId: event.chapter_id, chapterTitle: titleByChapter.get(event.chapter_id) ?? "Chapter", stage: event.stage as ProgressHistoryItem["stage"], action: event.action as ProgressHistoryItem["action"], createdAt: event.created_at, canUndo: event.action !== "undo" && !event.undone_at })) } satisfies ProgressReadyModel;
}

export async function getProgressAnalyticsForDashboard(userId: string, chapterIds: string[]) {
  if (!chapterIds.length) return { overallPercent: 0, byChapter: new Map<string, ProgressState>() };
  const rows = (await getHotDashboardProgress(userId, chapterIds)) as ProgressRow[];
  const byChapter = new Map(rows.map((row) => [row.chapter_id, stateFromRow(row)]));
  return { overallPercent: overallPercent(chapterIds.map((id) => byChapter.get(id) ?? { ...EMPTY_STATE })), byChapter };
}


type DashboardSummarySubject = {
  id: string;
  title: string;
  slug: string;
  groupCode: string;
  groupName: string;
  chapterCount: number;
  chapterIds: string[];
};

export async function getProgressDashboardSummary(userId: string, subjects: DashboardSummarySubject[]) {
  const chapterIds = [...new Set(subjects.flatMap((subject) => subject.chapterIds))];
  const rows = chapterIds.length
    ? (await getHotDashboardProgress(userId, chapterIds)) as ProgressRow[]
    : [];
  const statesByChapter = new Map(rows.map((row) => [row.chapter_id, stateFromRow(row)]));
  const states = chapterIds.map((chapterId) => statesByChapter.get(chapterId) ?? { ...EMPTY_STATE });
  const count = (key: keyof ProgressState) => states.filter((state) => state[key]).length;

  const subjectSummaries = subjects.map((subject) => {
    const subjectStates = subject.chapterIds.map((chapterId) => statesByChapter.get(chapterId) ?? { ...EMPTY_STATE });
    return {
      id: subject.id,
      title: subject.title,
      slug: subject.slug,
      groupCode: subject.groupCode,
      groupName: subject.groupName,
      chapterCount: subject.chapterCount,
      completedCount: subjectStates.filter((state) => state.completed_at).length,
      completionPercent: percent(countStates(subjectStates, "completed_at"), subjectStates.length),
      revisionPercent: percent(countStates(subjectStates, "revision_1_at") + countStates(subjectStates, "revision_2_at"), subjectStates.length * 2),
      testPercent: percent(countStates(subjectStates, "test_1_at") + countStates(subjectStates, "test_2_at"), subjectStates.length * 2),
      overallPercent: overallPercent(subjectStates),
    };
  });

  const groupSummaries = [...new Map(subjects.map((subject) => [subject.groupCode, { code: subject.groupCode, name: subject.groupName }])).values()].map((group) => {
    const groupIds = subjects.filter((subject) => subject.groupCode === group.code).flatMap((subject) => subject.chapterIds);
    const groupStates = groupIds.map((chapterId) => statesByChapter.get(chapterId) ?? { ...EMPTY_STATE });
    return { code: group.code, name: group.name, chapterCount: groupStates.length, completedCount: countStates(groupStates, "completed_at"), overallPercent: overallPercent(groupStates) };
  });

  return {
    overallPercent: overallPercent(states),
    revision1Count: count("revision_1_at"),
    revision2Count: count("revision_2_at"),
    test1Count: count("test_1_at"),
    test2Count: count("test_2_at"),
    subjects: subjectSummaries,
    groups: groupSummaries,
  };
}

function countStates(states: ProgressState[], key: keyof ProgressState) {
  return states.filter((state) => state[key]).length;
}
