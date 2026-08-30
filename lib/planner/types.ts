import type { StudySubjectOption } from "@/lib/study/types";

export type TaskKind = "study" | "revision" | "test" | "other";
export type TaskStatus = "todo" | "done" | "cancelled";
export type GoalStatus = "active" | "completed" | "cancelled";

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
  kind: TaskKind | "goal" | "personal" | "exam";
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  readOnly: boolean;
  status?: string;
  estimatedMinutes?: number;
  sourceUrl?: string | null;
};

export type PlannerReadyModel = {
  mode: "ready";
  viewerName: string;
  subjects: StudySubjectOption[];
  tasks: PlannerTask[];
  goals: PlannerGoal[];
};

export type PlannerPageModel = { mode: "guest" } | { mode: "setup"; viewerName: string } | PlannerReadyModel;
export type GoalsPageModel = { mode: "guest" } | { mode: "setup"; viewerName: string } | { mode: "ready"; viewerName: string; goals: PlannerGoal[] };
export type CalendarPageModel = { mode: "guest" } | { mode: "setup"; viewerName: string } | { mode: "ready"; viewerName: string; month: string; items: CalendarItem[] };

export type ActivityItem = {
  id: string;
  source: "study" | "progress";
  occurredAt: string;
  title: string;
  description: string;
  href: string;
};
export type ActivityPageModel = { mode: "guest" } | { mode: "ready"; viewerName: string; items: ActivityItem[] };
