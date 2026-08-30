export type StudyMode = "stopwatch" | "pomodoro";
export type StudyTimerStatus = "running" | "paused";

export type StudyChapterOption = { id: string; number: string; title: string };
export type StudySubjectOption = { id: string; slug: string; title: string; chapters: StudyChapterOption[] };

export type StudyTimerSnapshot = {
  status: StudyTimerStatus;
  mode: StudyMode;
  subjectId: string | null;
  chapterId: string | null;
  subjectTitle: string | null;
  chapterTitle: string | null;
  focusTargetSeconds: number | null;
  breakTargetSeconds: number | null;
  startedAt: string;
  runningSince: string | null;
  elapsedSeconds: number;
  pausedAt: string | null;
  timezone: string;
  lastInteractionAt: string;
  abandoned: boolean;
};

export type StudySessionItem = {
  id: string;
  subjectId: string | null;
  chapterId: string | null;
  subjectTitle: string | null;
  chapterTitle: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  mode: StudyMode;
  timezone: string;
};

export type StudyAnalytics = {
  todaySeconds: number;
  last7DaysSeconds: number;
  sessionCountLast7Days: number;
  streakDays: number;
  daily: Array<{ date: string; seconds: number }>;
  recentSessions: StudySessionItem[];
};

export type StudyReadyModel = {
  mode: "ready";
  viewerName: string;
  levelName: string;
  groupLabel: string;
  attemptKey: string;
  subjects: StudySubjectOption[];
  timer: StudyTimerSnapshot | null;
  analytics: StudyAnalytics;
};

export type StudyPageModel =
  | { mode: "guest" }
  | { mode: "setup"; viewerName: string }
  | StudyReadyModel;

export type StudyTimerMutationResult = {
  status?: StudyTimerStatus;
  started_at?: string;
  running_since?: string;
  elapsed_seconds?: number;
  saved_at?: string;
  session_id?: string;
  duration_seconds?: number;
  ended_at?: string;
};
