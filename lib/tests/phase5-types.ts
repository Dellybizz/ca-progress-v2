import type { ProgressState } from "@/lib/progress/types";
import type { TestProgressStage } from "./types";

export const TEST_MISTAKE_CATEGORIES = [
  "conceptual",
  "calculation",
  "forgot_provision_formula",
  "presentation",
  "time_management",
  "didnt_revise",
  "silly_mistake",
  "didnt_understand_question",
  "other",
] as const;
export type TestMistakeCategory = (typeof TEST_MISTAKE_CATEGORIES)[number];

export const TEST_ATTACHMENT_KINDS = [
  "question_paper",
  "my_answer_sheet",
  "checked_paper",
  "suggested_answer",
] as const;
export type TestAttachmentKind = (typeof TEST_ATTACHMENT_KINDS)[number];

export type TestAttemptAttachment = {
  id: string;
  attemptId: string;
  kind: TestAttachmentKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type TestAttemptMistake = {
  id: string;
  attemptId: string;
  category: TestMistakeCategory;
  note: string | null;
  createdAt: string;
};

export type TestAttempt = {
  id: string;
  subjectId: string;
  subjectTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: string;
  stage: TestProgressStage;
  attemptNumber: number;
  marksScored: number;
  marksTotal: number;
  percentage: number;
  durationMinutes: number | null;
  completedAt: string;
  improvementPoints: number | null;
  progressEventId: string | null;
  createdAt: string;
  mistakes: TestAttemptMistake[];
  attachments: TestAttemptAttachment[];
};

export type TestAttemptSaveResult = {
  attempt: TestAttempt;
  state: ProgressState;
  progressChanged: boolean;
  retry: boolean;
  eventId: string | null;
  savedAt: string;
};

export type TestJournalEntry = TestAttemptMistake & {
  subjectId: string;
  subjectTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: string;
  stage: TestProgressStage;
  attemptNumber: number;
  percentage: number;
  completedAt: string;
};

export type TestArchiveModel = {
  attempts: TestAttempt[];
  journal: TestJournalEntry[];
};
