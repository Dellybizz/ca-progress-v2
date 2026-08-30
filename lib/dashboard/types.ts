export type DashboardActionKey = "start_study" | "add_task" | "add_note" | "open_progress";
export type DashboardAnalyticsEventType = "dashboard_view" | "quick_action";

export type DashboardQuickAction = {
  key: DashboardActionKey;
  label: string;
  description: string;
  href: string;
};

export type DashboardAcademicSubject = {
  id: string;
  title: string;
  slug: string;
  groupCode: string;
  groupName: string;
  chapterCount: number;
};

export type DashboardAcademicReference = {
  level: { id: string; code: string; name: string };
  groups: Array<{ id: string; code: string; name: string }>;
  subjects: DashboardAcademicSubject[];
  totalChapters: number;
};

export type DashboardAttemptReference = {
  id: string;
  key: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  sourceUrl: string;
  lastVerifiedAt: string;
};

export type DashboardExamEvent = {
  id: string;
  title: string;
  eventType: string;
  eventDate: string;
  sourceUrl: string;
  lastVerifiedAt: string;
};

export type DashboardIcaiUpdate = {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  officialUrl: string;
  sourceName: string;
  sourceUrl: string;
  publishedOn: string | null;
  lastVerifiedAt: string;
  lastChangedAt: string;
};

export type DashboardLiveReference = {
  attempt: DashboardAttemptReference | null;
  examEvents: DashboardExamEvent[];
  updates: DashboardIcaiUpdate[];
  verifiedAt: string | null;
};

export type DashboardReadyModel = {
  mode: "ready";
  generatedAt: string;
  viewer: { authenticated: true; id: string; displayName: string };
  context: {
    levelCode: string;
    levelName: string;
    groupChoice: string;
    groupLabel: string;
    attemptKey: string;
    attemptLabel: string;
    subjectCount: number;
    chapterCount: number;
  };
  countdown: {
    status: "scheduled" | "past" | "awaiting_verified_date";
    daysRemaining: number | null;
    targetDate: string | null;
    title: string;
    sourceUrl: string | null;
    lastVerifiedAt: string | null;
    sourceKind: "exam_event" | "attempt" | "none";
  };
  today: {
    status: "awaiting_future_sources";
    tasks: number | null;
    revisions: number | null;
    tests: number | null;
  };
  progress: {
    status: "awaiting_phase5";
    overallPercent: number | null;
    groups: Array<{ code: string; name: string; subjectCount: number; chapterCount: number; percent: number | null }>;
    subjects: Array<DashboardAcademicSubject & { percent: number | null }>;
  };
  study: {
    status: "awaiting_phase6";
    dailyTargetMinutes: number;
    weeklyTargetMinutes: number;
    studiedThisWeekMinutes: number | null;
    streakDays: number | null;
  };
  icai: {
    updates: DashboardIcaiUpdate[];
    verifiedAt: string | null;
  };
  alerts: Array<{ kind: "revision" | "test" | "streak"; title: string; description: string; phase: 5 | 6 | 9 }>;
  recommendation: {
    slot: "next_study";
    status: "contextual_fallback" | "empty";
    title: string;
    description: string;
    href: string;
    phase9Ready: true;
  };
  quickActions: DashboardQuickAction[];
};

export type DashboardPageModel =
  | {
      mode: "guest";
      generatedAt: string;
      viewer: { authenticated: false; displayName: "Guest" };
    }
  | {
      mode: "onboarding";
      generatedAt: string;
      viewer: { authenticated: true; id: string; displayName: string };
      reason: "profile_incomplete";
    }
  | DashboardReadyModel;
