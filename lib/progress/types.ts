export const PROGRESS_STAGES = ["completed", "revision_1", "revision_2", "test_1", "test_2"] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];

export type ProgressState = {
  completed_at: string | null;
  revision_1_at: string | null;
  revision_2_at: string | null;
  test_1_at: string | null;
  test_2_at: string | null;
};

export type ProgressChapter = {
  id: string;
  number: string;
  title: string;
  subjectId: string;
  subjectTitle: string;
  subjectSlug: string;
  groupCode: string;
  groupName: string;
  state: ProgressState;
  updatedAt: string | null;
};

export type ProgressSubjectSummary = {
  id: string;
  title: string;
  slug: string;
  groupCode: string;
  groupName: string;
  chapterCount: number;
  completedCount: number;
  completionPercent: number;
  revisionPercent: number;
  testPercent: number;
  overallPercent: number;
};

export type ProgressGroupSummary = {
  code: string;
  name: string;
  chapterCount: number;
  completedCount: number;
  overallPercent: number;
};

export type ProgressAnalytics = {
  chapterCount: number;
  completedCount: number;
  completionPercent: number;
  revision1Count: number;
  revision2Count: number;
  revisionPercent: number;
  test1Count: number;
  test2Count: number;
  testPercent: number;
  overallPercent: number;
  stagesAddedLast7Days: number;
  activeDaysLast7Days: number;
  subjects: ProgressSubjectSummary[];
  groups: ProgressGroupSummary[];
};

export type ProgressHistoryItem = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  stage: ProgressStage;
  action: "set" | "clear" | "undo";
  createdAt: string;
  canUndo: boolean;
};

export type ProgressReadyModel = {
  mode: "ready";
  viewerName: string;
  levelName: string;
  attemptKey: string;
  groupLabel: string;
  chapters: ProgressChapter[];
  analytics: ProgressAnalytics;
  history: ProgressHistoryItem[];
};

export type ProgressPageModel =
  | { mode: "guest" }
  | { mode: "setup"; viewerName: string }
  | ProgressReadyModel;

export type ProgressMutationResult = {
  chapter_id: string;
  state: ProgressState;
  event_id: string | null;
  saved_at: string;
  reverted_event_id?: string;
};
