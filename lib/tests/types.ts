import type { ProgressState } from "@/lib/progress/types";

export const TEST_PROGRESS_STAGES = ["test_1", "test_2"] as const;
export type TestProgressStage = (typeof TEST_PROGRESS_STAGES)[number];

export type TestStageRecord = {
  id: string;
  chapterId: string;
  stage: TestProgressStage;
  marksScored: number;
  marksTotal: number;
  completedAt: string;
  progressEventId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TestStageSaveResult = {
  record: TestStageRecord;
  state: ProgressState;
  progressChanged: boolean;
  eventId: string | null;
  savedAt: string;
};

export type TestStageUndoResult = {
  recordId: string;
  chapterId: string;
  state: ProgressState;
  progressChanged: boolean;
  eventId: string | null;
  savedAt: string;
};
