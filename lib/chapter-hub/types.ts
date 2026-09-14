import type { ProgressState, ProgressStage } from "@/lib/progress/types";

export type ChapterHubAcademic = {
  chapterId: string; chapterNumber: string; chapterTitle: string; chapterKind: string; sectionKey: string | null; stableKey: string;
  subjectId: string; subjectSlug: string; subjectTitle: string; paperLabel: string; levelId: string; levelCode: string; levelName: string;
  groupId: string; groupCode: string; groupName: string; syllabusVersionId: string; syllabusVersionKey: string; syllabusVersionTitle: string;
};

export type ChapterHubStudySession = {
  id: string; startedAt: string; endedAt: string; durationSeconds: number; mode: string;
  understandingScore: number | null; focusRating: "poor" | "okay" | "focused" | null; intendedTaskTitle: string | null;
};
export type ChapterHubProgressEvent = { id: string; stage: ProgressStage; action: string; createdAt: string };
export type ChapterHubNote = { id: string; title: string; excerpt: string; updatedAt: string };
export type ChapterHubFile = { id: string; title: string; filename: string; extension: string; sizeBytes: number; updatedAt: string };
export type ChapterHubDoubtChannel = { id: string; channelKey: string; title: string; description: string };
export type ChapterHubOfficialResource = { canonicalResourceId: string; title: string; resourceType: string; sourceName: string; publishedOn: string | null; lastVerifiedAt: string };
export type ChapterHubTopic = { id: string; unitNumber: string | null; title: string; kind: string };

export type ChapterHubReadyModel = {
  mode: "ready";
  viewerName: string;
  attemptKey: string;
  academic: ChapterHubAcademic;
  topics: ChapterHubTopic[];
  progress: ProgressState;
  progressUpdatedAt: string | null;
  progressEvents: ChapterHubProgressEvent[];
  study: {
    totalSeconds: number;
    sessionCount: number;
    averageSelfReportedUnderstanding: number | null;
    reflectedSessionCount: number;
    recentSessions: ChapterHubStudySession[];
  };
  notes: ChapterHubNote[];
  files: ChapterHubFile[];
  doubtChannels: ChapterHubDoubtChannel[];
  officialResources: ChapterHubOfficialResource[];
};

export type ChapterHubModel =
  | { mode: "guest" }
  | { mode: "setup"; viewerName: string }
  | { mode: "missing" }
  | { mode: "scope_mismatch" }
  | ChapterHubReadyModel;
