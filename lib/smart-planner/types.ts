export type ForecastStatus = "complete" | "on_track" | "at_risk" | "behind" | "no_date";
export type SmartPlanItemKind = "revision" | "task" | "new_chapter" | "test";
export type SmartPlanItemStatus = "planned" | "completed" | "skipped" | "rescheduled";
export type SmartPlanSourceType = "revision_due" | "task" | "chapter" | "test";

export type RevisionSettings = {
  intervalDays: number[];
  preferredWeekdays: number[];
  revisionMinutes: number;
  newChapterMinutes: number;
  testMinutes: number;
  updatedAt: string | null;
};

export type WeakSubjectWarning = {
  subjectId: string;
  subjectTitle: string;
  completionPercent: number;
  recentStudyMinutes: number;
  reason: string;
};

export type ForecastSummary = {
  id: string | null;
  attemptKey: string;
  attemptLabel: string;
  attemptAnchorDate: string | null;
  dateSource: "verified_exam_date" | "attempt_month" | "unavailable";
  totalChapters: number;
  completedChapters: number;
  remainingChapters: number;
  completionPercent: number;
  observedChaptersPerWeek: number;
  requiredChaptersPerWeek: number;
  projectedCompletionDate: string | null;
  targetCompletionDate: string | null;
  status: ForecastStatus;
  explanation: string;
  capturedAt: string | null;
};

export type ForecastHistoryPoint = {
  id: string;
  createdAt: string;
  completedChapters: number;
  totalChapters: number;
  status: ForecastStatus;
  projectedCompletionDate: string | null;
};

export type TodayPlanItem = {
  id: string;
  sourceType: SmartPlanSourceType;
  sourceKey: string;
  sourceId: string | null;
  chapterId: string | null;
  subjectId: string | null;
  revisionNumber: number | null;
  testNumber: number | null;
  title: string;
  itemKind: SmartPlanItemKind;
  estimatedMinutes: number;
  priorityScore: number;
  reasonCode: string;
  reasonText: string;
  status: SmartPlanItemStatus;
  scheduledFor: string;
  scheduledAt: string | null;
  manualOverride: boolean;
  manualNote: string | null;
  position: number;
  completedAt: string | null;
  subjectTitle: string | null;
  chapterTitle: string | null;
  overdueDays: number;
  displayTitle?: string;
  chapterDisplayTitle?: string | null;
  scheduleState?: "overdue" | "fixed" | "planned" | null;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  startedAt?: string | null;
};

export type TodayPlanReadyModel = {
  mode: "ready";
  viewerName: string;
  planDate: string;
  timezone: string;
  targetMinutes: number;
  plannedMinutes: number;
  generatedAt: string;
  preferredStudyDay: boolean;
  dueRevisionCount: number;
  overdueRevisionCount: number;
  items: TodayPlanItem[];
  warnings: string[];
  weakSubjects: WeakSubjectWarning[];
  forecast: ForecastSummary;
  canUndo?: boolean;
};

export type TodayPlanPageModel =
  | { mode: "guest" }
  | { mode: "setup"; viewerName: string }
  | TodayPlanReadyModel;

export type RevisionSettingsPageModel =
  | { mode: "guest" }
  | { mode: "setup"; viewerName: string }
  | { mode: "ready"; viewerName: string; settings: RevisionSettings };

export type ForecastPageModel =
  | { mode: "guest" }
  | { mode: "setup"; viewerName: string }
  | {
      mode: "ready";
      viewerName: string;
      forecast: ForecastSummary;
      history: ForecastHistoryPoint[];
      weakSubjects: WeakSubjectWarning[];
      warnings: string[];
    };

export type PlannerCandidate = {
  sourceType: SmartPlanSourceType;
  sourceKey: string;
  sourceId: string | null;
  chapterId: string | null;
  subjectId: string | null;
  revisionNumber: number | null;
  testNumber: number | null;
  title: string;
  itemKind: SmartPlanItemKind;
  estimatedMinutes: number;
  priorityScore: number;
  reasonCode: string;
  reasonText: string;
  urgent: boolean;
  overdueDays: number;
};

export type TodayPlanAction =
  | { action: "refresh" }
  | { action: "complete"; itemId: string }
  | { action: "skip"; itemId: string }
  | { action: "snooze"; itemId: string; minutes: number }
  | { action: "reschedule"; itemId: string; date: string };

export type TodayPlanInteractionAction =
  | TodayPlanAction
  | { action: "start"; itemId: string }
  | { action: "reorder"; itemIds: string[] }
  | { action: "undo" };
