import "server-only";

import { getAcademicCatalog } from "@/lib/academic/query";
import { getStudentContext, selectionForAcademicQuery } from "@/lib/academic/student-context";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { evaluateBaselineForecast, type Phase9ForecastResult } from "./phase9-policy.mjs";

const DAY_MS = 86_400_000;

type ProgressRow = {
  chapter_id: string;
  completed_at: string | null;
  revision_1_at: string | null;
  revision_2_at: string | null;
  test_1_at: string | null;
  test_2_at: string | null;
};
type SessionRow = { id: string; subject_id: string | null; chapter_id: string | null; duration_seconds: number; ended_at: string; timezone: string };
type ReflectionRow = { session_id: string; subject_id: string | null; chapter_id: string | null; ended_at: string; understanding_score: number };
type TestRow = { id: string; subject_id: string; chapter_id: string; test_stage: "test_1" | "test_2"; attempt_number: number; marks_scored: number; marks_total: number; percentage: number; completed_at: string };
type RevisionRow = { id: string; chapter_id: string; revision_number: number; due_at: string; manual_due_at: string | null };
type AttemptRow = { id: string; label: string; start_date: string | null };

export type Phase9WeeklyStudy = {
  currentMinutes: number;
  priorMinutes: number;
  changeMinutes: number;
  changePercent: number | null;
  direction: "up" | "down" | "flat" | "new";
  calculation: string;
};

export type Phase9SubjectConsistency = {
  subjectId: string;
  subjectTitle: string;
  activeDaysLast14: number;
  minutesLast14: number;
  calculation: string;
};

export type Phase9UnderstandingSignal = {
  score: number;
  subjectTitle: string | null;
  chapterTitle: string | null;
  endedAt: string;
  action: string;
  calculation: string;
} | null;

export type Phase9TestSignal = {
  percentage: number;
  subjectTitle: string;
  chapterTitle: string;
  stage: "test_1" | "test_2";
  attemptNumber: number;
  completedAt: string;
  marksScored: number;
  marksTotal: number;
} | null;

export type Phase9RevisionSignal = {
  chapterTitle: string;
  revisionNumber: number;
  dueAt: string;
  overdueDays: number;
  action: string;
  calculation: string;
} | null;

export type Phase9ReadinessMetric = {
  key: "first_coverage" | "revision_readiness" | "testing_readiness";
  label: string;
  percent: number;
  numerator: number;
  denominator: number;
  calculation: string;
  question: string;
};

export type Phase9ReadyModel = {
  mode: "ready";
  viewerName: string;
  levelName: string;
  groupLabel: string;
  attemptKey: string;
  timezone: string;
  weeklyStudy: Phase9WeeklyStudy;
  consistency: Phase9SubjectConsistency[];
  lowestUnderstanding: Phase9UnderstandingSignal;
  highestTest: Phase9TestSignal;
  recentTest: Phase9TestSignal;
  mostOverdueRevision: Phase9RevisionSignal;
  readiness: Phase9ReadinessMetric[];
  forecast: Phase9ForecastResult & { attemptLabel: string; calculation: string; boundary: string };
  evidence: {
    studySessionsLast14: number;
    reflectedSessions: number;
    testAttempts: number;
    completedChapters: number;
  };
};

export type Phase9AnalyticsModel =
  | { mode: "guest" }
  | { mode: "setup"; viewerName: string }
  | Phase9ReadyModel;

function safeTimezone(timezone: string | null | undefined) {
  if (!timezone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "UTC";
  }
}

function localDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function groupLabel(groupChoice: string, groups: Array<{ code: string; name: string }>) {
  if (groupChoice === "both") return "Both groups";
  if (groupChoice === "not_applicable") return groups[0]?.name ?? "All papers";
  return groups.find((group) => group.code === groupChoice)?.name ?? groupChoice.replaceAll("_", " ");
}

function placeholders(count: number, start = 2) {
  return Array.from({ length: count }, (_, index) => `?${start + index}`).join(",");
}

async function verifiedAttemptDate(attemptKey: string, levelId: string) {
  const db = getD1RuntimeDatabase();
  const attempt = await db.prepare(`SELECT id,label,start_date FROM exam_attempts
    WHERE attempt_key=?1 AND level_id=?2 AND verification_status='verified' AND status<>'cancelled'
    ORDER BY CASE WHEN start_date IS NULL THEN 1 ELSE 0 END,start_date ASC LIMIT 1`)
    .bind(attemptKey, levelId).first<AttemptRow>();
  if (!attempt) return { label: attemptKey, date: null as string | null };
  if (attempt.start_date) return { label: attempt.label, date: attempt.start_date };
  const event = await db.prepare(`SELECT event_date FROM exam_events
    WHERE attempt_id=?1 AND verification_status='verified' ORDER BY event_date ASC LIMIT 1`)
    .bind(attempt.id).first<{ event_date: string }>();
  return { label: attempt.label, date: event?.event_date ?? null };
}

function testSignal(row: TestRow | null, subjectTitles: Map<string, string>, chapterTitles: Map<string, string>): Phase9TestSignal {
  if (!row) return null;
  return {
    percentage: Number(row.percentage),
    subjectTitle: subjectTitles.get(row.subject_id) ?? "Applicable subject",
    chapterTitle: chapterTitles.get(row.chapter_id) ?? "Applicable chapter",
    stage: row.test_stage,
    attemptNumber: Number(row.attempt_number),
    completedAt: row.completed_at,
    marksScored: Number(row.marks_scored),
    marksTotal: Number(row.marks_total),
  };
}

export async function getPhase9AnalyticsModel(now = new Date()): Promise<Phase9AnalyticsModel> {
  const context = await getStudentContext();
  if (context.mode === "guest") return { mode: "guest" };
  const name = context.displayName;
  if (context.mode !== "ready" || !context.selection || !context.userId) return { mode: "setup", viewerName: name };
  const identity = { id: context.userId };
  const catalog = await getAcademicCatalog(selectionForAcademicQuery(context));
  const chapterIds = catalog.subjects.flatMap((subject) => subject.chapters.map((chapter) => chapter.id));
  const subjectTitles = new Map(catalog.subjects.map((subject) => [subject.id, subject.title]));
  const chapterTitles = new Map(catalog.subjects.flatMap((subject) => subject.chapters.map((chapter) => [chapter.id, chapter.title] as const)));
  const timezone = safeTimezone(context.timezone);
  const db = getD1RuntimeDatabase();
  const fourteenDaysAgo = new Date(now.valueOf() - 14 * DAY_MS).toISOString();
  const sixtyDaysAgo = new Date(now.valueOf() - 60 * DAY_MS).toISOString();

  const [sessionResult, reflectionResult, attempt] = await Promise.all([
    db.prepare(`SELECT id,subject_id,chapter_id,duration_seconds,ended_at,timezone FROM study_sessions
      WHERE user_id=?1 AND ended_at>=?2 ORDER BY ended_at DESC LIMIT 1200`).bind(identity.id, fourteenDaysAgo).all<SessionRow>(),
    db.prepare(`SELECT ss.id AS session_id,ss.subject_id,ss.chapter_id,ss.ended_at,x.understanding_score
      FROM study_sessions ss JOIN study_session_phase3 x ON x.session_id=ss.id AND x.user_id=ss.user_id
      WHERE ss.user_id=?1 AND x.understanding_score IS NOT NULL AND ss.ended_at>=?2
      ORDER BY ss.ended_at DESC LIMIT 800`).bind(identity.id, sixtyDaysAgo).all<ReflectionRow>(),
    verifiedAttemptDate(context.selection.attemptKey, catalog.selectedLevel.id),
  ]);

  let progressRows: ProgressRow[] = [];
  let testRows: TestRow[] = [];
  let revisionRows: RevisionRow[] = [];
  if (chapterIds.length) {
    const clause = placeholders(chapterIds.length);
    const [progressResult, testResult, revisionResult] = await Promise.all([
      db.prepare(`SELECT chapter_id,completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at FROM chapter_progress
        WHERE user_id=?1 AND chapter_id IN (${clause})`).bind(identity.id, ...chapterIds).all<ProgressRow>(),
      db.prepare(`SELECT id,subject_id,chapter_id,test_stage,attempt_number,marks_scored,marks_total,percentage,completed_at FROM test_attempts
        WHERE user_id=?1 AND chapter_id IN (${clause}) ORDER BY completed_at DESC,attempt_number DESC LIMIT 1200`).bind(identity.id, ...chapterIds).all<TestRow>(),
      db.prepare(`SELECT id,chapter_id,revision_number,due_at,manual_due_at FROM revision_due_items
        WHERE user_id=?1 AND chapter_id IN (${clause}) AND status='pending' ORDER BY due_at ASC LIMIT 1200`).bind(identity.id, ...chapterIds).all<RevisionRow>(),
    ]);
    progressRows = progressResult.results ?? [];
    testRows = testResult.results ?? [];
    revisionRows = revisionResult.results ?? [];
  }

  const sessions = sessionResult.results ?? [];
  const reflections = reflectionResult.results ?? [];
  const currentStart = now.valueOf() - 7 * DAY_MS;
  const priorStart = now.valueOf() - 14 * DAY_MS;
  const currentSeconds = sessions.filter((row) => Date.parse(row.ended_at) >= currentStart).reduce((sum, row) => sum + Number(row.duration_seconds), 0);
  const priorSeconds = sessions.filter((row) => {
    const ended = Date.parse(row.ended_at);
    return ended >= priorStart && ended < currentStart;
  }).reduce((sum, row) => sum + Number(row.duration_seconds), 0);
  const currentMinutes = Math.round(currentSeconds / 60);
  const priorMinutes = Math.round(priorSeconds / 60);
  const changeMinutes = currentMinutes - priorMinutes;
  const changePercent = priorMinutes ? Math.round((changeMinutes / priorMinutes) * 100) : null;
  const weeklyStudy: Phase9WeeklyStudy = {
    currentMinutes,
    priorMinutes,
    changeMinutes,
    changePercent,
    direction: priorMinutes === 0 && currentMinutes > 0 ? "new" : changeMinutes > 0 ? "up" : changeMinutes < 0 ? "down" : "flat",
    calculation: "Completed study_sessions in the rolling last 7 days are summed from duration_seconds and compared with the preceding 7 days.",
  };

  const consistency: Phase9SubjectConsistency[] = catalog.subjects.map((subject) => {
    const rows = sessions.filter((row) => row.subject_id === subject.id);
    const days = new Set(rows.map((row) => localDateKey(new Date(row.ended_at), row.timezone || timezone)));
    return {
      subjectId: subject.id,
      subjectTitle: subject.title,
      activeDaysLast14: days.size,
      minutesLast14: Math.round(rows.reduce((sum, row) => sum + Number(row.duration_seconds), 0) / 60),
      calculation: "Distinct local calendar days with at least one completed study session in the last 14 days; minutes are summed from those same sessions.",
    };
  }).sort((a, b) => b.activeDaysLast14 - a.activeDaysLast14 || b.minutesLast14 - a.minutesLast14);

  const lowestReflection = [...reflections].sort((a, b) => Number(a.understanding_score) - Number(b.understanding_score) || b.ended_at.localeCompare(a.ended_at))[0] ?? null;
  const lowestUnderstanding: Phase9UnderstandingSignal = lowestReflection ? {
    score: Number(lowestReflection.understanding_score),
    subjectTitle: lowestReflection.subject_id ? subjectTitles.get(lowestReflection.subject_id) ?? null : null,
    chapterTitle: lowestReflection.chapter_id ? chapterTitles.get(lowestReflection.chapter_id) ?? null : null,
    endedAt: lowestReflection.ended_at,
    action: "Revisit this area or schedule a short revision before adding more new work.",
    calculation: "Lowest saved self-rated understanding_score from completed Phase 3 study reflections in the last 60 days. This is a self-report signal, not mastery.",
  } : null;

  const highestRow = [...testRows].sort((a, b) => Number(b.percentage) - Number(a.percentage) || b.completed_at.localeCompare(a.completed_at))[0] ?? null;
  const recentRow = testRows[0] ?? null;
  const highestTest = testSignal(highestRow, subjectTitles, chapterTitles);
  const recentTest = testSignal(recentRow, subjectTitles, chapterTitles);

  const overdue = revisionRows.map((row) => {
    const due = new Date(row.manual_due_at ?? row.due_at);
    return { row, due, overdueDays: Math.floor((now.valueOf() - due.valueOf()) / DAY_MS) };
  }).filter((entry) => Number.isFinite(entry.due.valueOf()) && entry.overdueDays > 0)
    .sort((a, b) => b.overdueDays - a.overdueDays)[0] ?? null;
  const mostOverdueRevision: Phase9RevisionSignal = overdue ? {
    chapterTitle: chapterTitles.get(overdue.row.chapter_id) ?? "Applicable chapter",
    revisionNumber: Number(overdue.row.revision_number),
    dueAt: overdue.due.toISOString(),
    overdueDays: overdue.overdueDays,
    action: "Move this revision ahead of optional new work until the overdue queue is cleared.",
    calculation: "Among pending revision_due_items, CA Progress uses manual_due_at when present, otherwise due_at, and selects the item overdue by the most whole days.",
  } : null;

  const progressByChapter = new Map(progressRows.map((row) => [row.chapter_id, row]));
  const denominator = chapterIds.length;
  const completedCount = chapterIds.filter((id) => Boolean(progressByChapter.get(id)?.completed_at)).length;
  const revision1Count = chapterIds.filter((id) => Boolean(progressByChapter.get(id)?.revision_1_at)).length;
  const test1Count = chapterIds.filter((id) => Boolean(progressByChapter.get(id)?.test_1_at)).length;
  const readiness: Phase9ReadinessMetric[] = [
    {
      key: "first_coverage", label: "First Coverage", percent: percent(completedCount, denominator), numerator: completedCount, denominator,
      calculation: "Applicable chapters with First Completion recorded ÷ all applicable chapters × 100.",
      question: "How much of my syllabus have I covered once?",
    },
    {
      key: "revision_readiness", label: "Revision Readiness", percent: percent(revision1Count, denominator), numerator: revision1Count, denominator,
      calculation: "Applicable chapters with Revision 1 recorded ÷ all applicable chapters × 100.",
      question: "How much of my syllabus has reached at least one revision?",
    },
    {
      key: "testing_readiness", label: "Testing Readiness", percent: percent(test1Count, denominator), numerator: test1Count, denominator,
      calculation: "Applicable chapters with Test 1 recorded ÷ all applicable chapters × 100.",
      question: "How much of my syllabus has reached at least one recorded test?",
    },
  ];

  const completionDates = progressRows.flatMap((row) => row.completed_at ? [row.completed_at] : []);
  const forecast = evaluateBaselineForecast({
    totalChapters: denominator,
    completedChapters: completedCount,
    completionDates,
    verifiedAttemptDate: attempt.date,
    now,
  });

  return {
    mode: "ready",
    viewerName: name,
    levelName: catalog.selectedLevel.name,
    groupLabel: groupLabel(context.selection.group, catalog.groups),
    attemptKey: context.selection.attemptKey,
    timezone,
    weeklyStudy,
    consistency,
    lowestUnderstanding,
    highestTest,
    recentTest,
    mostOverdueRevision,
    readiness,
    forecast: {
      ...forecast,
      attemptLabel: attempt.label,
      calculation: "Baseline forecast only: recent chapter-completion pace is projected against the verified exam date and a deterministic 30-day revision-buffer target. No cohort, AI, Mentor, XP or self-rated-understanding score is used to calculate the forecast.",
      boundary: "This is deterministic CA Progress planning logic, not CA Thinker/Mentor intelligence or an exam-result prediction.",
    },
    evidence: {
      studySessionsLast14: sessions.length,
      reflectedSessions: reflections.length,
      testAttempts: testRows.length,
      completedChapters: completedCount,
    },
  };
}
