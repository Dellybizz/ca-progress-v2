export type AcademicLevelCode = "foundation" | "intermediate" | "final";

export type AcademicSelection = {
  level?: string | null;
  group?: string | null;
  attempt?: string | null;
};

export type AcademicTopic = {
  id: string;
  stableKey: string;
  unitNumber: string | null;
  title: string;
  kind: string;
};

export type AcademicChapter = {
  id: string;
  stableKey: string;
  number: string;
  title: string;
  sectionKey: string | null;
  kind: string;
  topics: AcademicTopic[];
};

export type AcademicVersion = {
  id: string;
  key: string;
  title: string;
  status: "published" | "superseded" | "upcoming";
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedesVersionId: string | null;
  sourceUrl: string;
  sourceLabel: string;
  sourceVerifiedAt: string;
};

export type AcademicSubject = {
  id: string;
  code: string;
  slug: string;
  paperLabel: string;
  title: string;
  kind: string;
  levelId: string;
  groupId: string;
  sourceUrl: string;
  version: AcademicVersion;
  chapters: AcademicChapter[];
};

export type AcademicGroup = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
};

export type AcademicLevel = {
  id: string;
  code: AcademicLevelCode;
  name: string;
  sortOrder: number;
};

export type AcademicCatalog = {
  levels: AcademicLevel[];
  groups: AcademicGroup[];
  attempts: string[];
  selectedLevel: AcademicLevel;
  selectedGroup: string;
  selectedAttempt: string | null;
  subjects: AcademicSubject[];
  sourceVerifiedAt: string | null;
};

export type AcademicSearchResult = {
  type: "subject" | "chapter" | "topic";
  id: string;
  title: string;
  subtitle: string;
  subjectSlug: string;
  subjectTitle: string;
  levelCode: AcademicLevelCode;
  groupCode: string;
  chapterId?: string;
};

export type AcademicVersionPreview = AcademicVersion & {
  subjectTitle: string;
  subjectSlug: string;
  levelName: string;
  groupName: string;
  chapterCount: number;
  topicCount: number;
};

export class AcademicDataError extends Error {
  constructor(message = "Academic data could not be loaded.") {
    super(message);
    this.name = "AcademicDataError";
  }
}
