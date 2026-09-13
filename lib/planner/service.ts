import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getStudentContext, selectionForAcademicQuery, type StudentContextContract } from "@/lib/academic/student-context";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { getHotActivityRows, getHotPlannerRows } from "@/lib/data/d1/hot-screens";
import type { Database } from "@/lib/data/database.types";
import type { StudySubjectOption } from "@/lib/study/types";
import { getPhase8GoalSummaries, getPhase8NotificationCenter, getSelectedAttemptCountdown, getTaskPlanningExtensions } from "./phase8";
import type { ActivityItem, ActivityPageModel, GoalsPageModel, PlannerPageModel, PlannerTask } from "./types";

export { getCalendarPageModel } from "./calendar";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type SessionRow = Database["public"]["Tables"]["study_sessions"]["Row"];
type ProgressEventRow = Database["public"]["Tables"]["progress_events"]["Row"];

async function academicOptions(context: StudentContextContract) {
  if (context.mode !== "ready") return [] as StudySubjectOption[];
  const catalog = await getAcademicCatalog(selectionForAcademicQuery(context));
  return catalog.subjects.map((subject) => ({ id: subject.id, slug: subject.slug, title: subject.title, chapters: subject.chapters.map((chapter) => ({ id: chapter.id, number: chapter.number, title: chapter.title })) }));
}

function maps(subjects: StudySubjectOption[]) {
  return {
    subjects: new Map(subjects.map((subject) => [subject.id, subject.title])),
    chapters: new Map(subjects.flatMap((subject) => subject.chapters.map((chapter) => [chapter.id, chapter.title] as const))),
  };
}

function taskDto(row: TaskRow, subjectNames: Map<string, string>, chapterNames: Map<string, string>, extension: { schedule_mode: "fixed" | "flexible"; target_date: string | null } | undefined): PlannerTask {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    taskKind: row.task_kind as PlannerTask["taskKind"],
    subjectId: row.subject_id,
    chapterId: row.chapter_id,
    subjectTitle: row.subject_id ? subjectNames.get(row.subject_id) ?? null : null,
    chapterTitle: row.chapter_id ? chapterNames.get(row.chapter_id) ?? null : null,
    dueAt: row.due_at,
    scheduleMode: extension?.schedule_mode ?? "fixed",
    targetDate: extension?.target_date ?? null,
    estimatedMinutes: row.estimated_minutes,
    status: row.status as PlannerTask["status"],
    completedAt: row.completed_at,
  };
}

export async function getPlannerPageModel(): Promise<PlannerPageModel> {
  const context = await getStudentContext();
  if (context.mode === "guest") return { mode: "guest" };
  const name = context.displayName;
  if (context.mode !== "ready" || !context.userId) return { mode: "setup", viewerName: name };
  const identity = { id: context.userId };
  const timezone = context.timezone;
  const subjects = await academicOptions(context);
  const names = maps(subjects);
  const hot = await getHotPlannerRows(identity.id);
  const [extensions, goals, countdown] = await Promise.all([
    getTaskPlanningExtensions(identity.id, hot.tasks.map((row) => row.id)),
    getPhase8GoalSummaries(identity.id, timezone),
    getSelectedAttemptCountdown(identity.id),
  ]);
  const center = await getPhase8NotificationCenter(identity.id, timezone, goals);
  return {
    mode: "ready",
    viewerName: name,
    timezone,
    subjects,
    tasks: hot.tasks.map((row) => taskDto(row as TaskRow, names.subjects, names.chapters, extensions.get(row.id))),
    goals,
    countdown,
    notifications: center.notifications,
    notificationPreferences: center.preferences,
  };
}

export async function getGoalsPageModel(): Promise<GoalsPageModel> {
  const model = await getPlannerPageModel();
  if (model.mode !== "ready") return model;
  return { mode: "ready", viewerName: model.viewerName, goals: model.goals };
}

async function loadActivityRows(userId: string) {
  const hot = await getHotActivityRows(userId, 40);
  return { sessions: hot.sessions, progress: hot.progress, error: null };
}

async function loadActivityNames(sessions: SessionRow[], progress: ProgressEventRow[]) {
  const subjectIds = [...new Set(sessions.map((row) => row.subject_id).filter((id): id is string => Boolean(id)))];
  const chapterIds = [...new Set([
    ...sessions.map((row) => row.chapter_id),
    ...progress.map((row) => row.chapter_id),
  ].filter((id): id is string => Boolean(id)))];
  if (!subjectIds.length && !chapterIds.length) return { subjects: new Map<string, string>(), chapters: new Map<string, string>() };
  const db = getD1RuntimeDatabase();
  const subjectPlaceholders = subjectIds.map((_, index) => `?${index + 1}`).join(",");
  const chapterPlaceholders = chapterIds.map((_, index) => `?${index + 1}`).join(",");
  const [subjects, chapters] = await Promise.all([
    subjectIds.length ? db.prepare(`SELECT id,title FROM subjects WHERE id IN (${subjectPlaceholders})`).bind(...subjectIds).all<{ id: string; title: string }>() : Promise.resolve({ results: [] }),
    chapterIds.length ? db.prepare(`SELECT id,title FROM chapters WHERE id IN (${chapterPlaceholders})`).bind(...chapterIds).all<{ id: string; title: string }>() : Promise.resolve({ results: [] }),
  ]);
  return {
    subjects: new Map((subjects.results ?? []).map((row) => [row.id, row.title])),
    chapters: new Map((chapters.results ?? []).map((row) => [row.id, row.title])),
  };
}

export async function getActivityPageModel(): Promise<ActivityPageModel> {
  const context = await getStudentContext();
  if (context.mode === "guest") return { mode: "guest" };
  if (!context.userId) return { mode: "guest" };
  const identity = { id: context.userId };
  const name = context.displayName;
  const { sessions, progress } = await loadActivityRows(identity.id);
  const allowedSubjects = new Set(context.subjectIds);
  const allowedVersions = new Set(context.syllabusVersionIds);
  const db = getD1RuntimeDatabase();
  const allowedChapterRows = context.mode === "ready" && allowedVersions.size ? (await db.prepare(`SELECT id FROM chapters WHERE syllabus_version_id IN (${[...allowedVersions].map((_,i)=>`?${i+1}`).join(",")})`).bind(...allowedVersions).all<{id:string}>()).results ?? [] : [];
  const allowedChapters = new Set(allowedChapterRows.map((row)=>row.id));
  const sessionRows = ((sessions ?? []) as SessionRow[]).filter((row)=>!row.subject_id || allowedSubjects.has(row.subject_id)).filter((row)=>!row.chapter_id || allowedChapters.has(row.chapter_id));
  const progressRows = ((progress ?? []) as ProgressEventRow[]).filter((row)=>allowedChapters.has(row.chapter_id));
  const names = await loadActivityNames(sessionRows, progressRows);
  const items: ActivityItem[] = [];
  for (const row of sessionRows) {
    const subject = row.subject_id ? names.subjects.get(row.subject_id) : null;
    const chapter = row.chapter_id ? names.chapters.get(row.chapter_id) : null;
    items.push({ id: `study:${row.id}`, source: "study", occurredAt: row.ended_at, title: `Studied ${Math.max(1, Math.round(row.duration_seconds / 60))} min`, description: chapter ?? subject ?? "General study session", href: "/study" });
  }
  const stageLabel: Record<string, string> = { completed: "Completed", revision_1: "Revision 1", revision_2: "Revision 2", test_1: "Test 1", test_2: "Test 2" };
  for (const row of progressRows) items.push({ id: `progress:${row.id}`, source: "progress", occurredAt: row.created_at, title: `${row.action === "clear" ? "Cleared" : row.action === "undo" ? "Undid" : "Saved"} ${stageLabel[row.stage] ?? row.stage}`, description: names.chapters.get(row.chapter_id) ?? "Chapter progress", href: "/progress" });
  items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return { mode: "ready", viewerName: name, items: items.slice(0, 60) };
}
