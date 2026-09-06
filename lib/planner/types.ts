import type { StudySubjectOption } from "@/lib/study/types";

export type TaskKind = "class" | "study" | "revision" | "test" | "mock" | "personal" | "other";
export type TaskStatus = "todo" | "done" | "cancelled";
export type TaskScheduleMode = "fixed" | "flexible";
export type GoalStatus = "active" | "completed" | "cancelled";
export type GoalKind = "daily_study" | "weekly_study" | "completion" | "revision" | "test" | "custom";
export type GoalUnit = "minutes" | "count";
export type CountdownMilestone = "normal" | "90" | "60" | "30" | "15" | "7" | "today" | "past" | "unavailable";
export type PlannerNotificationType = "revision_due" | "test_tomorrow" | "goal_near_completion" | "doubt_answered" | "buddy_activity";
export type NotificationFrequency = "realtime" | "daily_digest" | "off";

export type PlannerTask = {
  id: string;
  title: string;
  notes: string | null;
  taskKind: TaskKind;
  subjectId: string | null;
  chapterId: string | null;
  subjectTitle: string | null;
  chapterTitle: string | null;
  dueAt: string;
  scheduleMode: TaskScheduleMode;
  targetDate: string | null;
  estimatedMinutes: number;
  status: TaskStatus;
  completedAt: string | null;
};

export type PlannerGoal = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: GoalStatus;
  completedAt: string | null;
  goalKind: GoalKind;
  targetValue: number;
  targetUnit: GoalUnit;
  startsOn: string | null;
  currentValue: number;
  progressPercent: number;
};

export type AttemptCountdown = {
  attemptKey: string | null;
  attemptLabel: string | null;
  anchorDate: string | null;
  daysRemaining: number | null;
  milestone: CountdownMilestone;
  source: "verified_attempt" | "verified_exam_event" | "unavailable";
};

export type NotificationPreferences = {
  revisionDue: boolean;
  testTomorrow: boolean;
  goalNearCompletion: boolean;
  doubtAnswered: boolean;
  buddyActivity: boolean;
  frequency: NotificationFrequency;
  maxPerDay: number;
};

export type PlannerNotification = {
  id: string;
  notificationType: PlannerNotificationType;
  title: string;
  body: string;
  actionHref: string;
  readAt: string | null;
  createdAt: string;
};

export type UserCalendarEvent = {
  id: string;
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
};

export type CalendarItem = {
  id: string;
  source: "task" | "goal" | "user" | "icai";
  kind: TaskKind | "goal" | "exam";
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  readOnly: boolean;
  status?: string;
  estimatedMinutes?: number;
  scheduleMode?: TaskScheduleMode;
  sourceUrl?: string | null;
};

export type PlannerReadyModel = {
  mode: "ready";
  viewerName: string;
  timezone: string;
  subjects: StudySubjectOption[];
  tasks: PlannerTask[];
  goals: PlannerGoal[];
  countdown: AttemptCountdown;
  notifications: PlannerNotification[];
  notificationPreferences: NotificationPreferences;
};

export type PlannerPageModel = { mode: "guest" } | { mode: "setup"; viewerName: string } | PlannerReadyModel;
export type GoalsPageModel = { mode: "guest" } | { mode: "setup"; viewerName: string } | { mode: "ready"; viewerName: string; goals: PlannerGoal[] };
export type CalendarPageModel = { mode: "guest" } | { mode: "setup"; viewerName: string } | { mode: "ready"; viewerName: string; month: string; timezone: string; countdown: AttemptCountdown; items: CalendarItem[] };

export type ActivityItem = {
  id: string;
  source: "study" | "progress";
  occurredAt: string;
  title: string;
  description: string;
  href: string;
};
export type ActivityPageModel = { mode: "guest" } | { mode: "ready"; viewerName: string; items: ActivityItem[] };
