export type StudyProfileVisibility = "private" | "buddies" | "public";
export type StudyProfileRelationship = "owner" | "buddy" | "public";

export const STUDY_PROFILE_VISIBILITIES: readonly StudyProfileVisibility[];
export const PRIVATE_STUDY_PROFILE_DEFAULTS: Readonly<{
  profileVisibility: "private";
  progressVisibility: "private";
  streakVisibility: "private";
  showLevel: false;
  showAttempt: false;
}>;

export function normalizeStudyProfileVisibility(value: unknown): StudyProfileVisibility;
export function canViewStudyProfileScope(scope: unknown, relationship: StudyProfileRelationship): boolean;

export type StudyProfileSerializerSource = {
  userId: string;
  displayName?: string | null;
  publicBio?: string | null;
  caLevel?: string | null;
  attemptKey?: string | null;
  progress?: {
    firstCoveragePercent: number;
    revisionReadinessPercent: number;
    testingReadinessPercent: number;
  };
  streak?: {
    currentStreakDays: number;
    activeDaysLast14: number;
  };
};

export type StudyProfileSerializerSettings = {
  profileVisibility?: StudyProfileVisibility;
  progressVisibility?: StudyProfileVisibility;
  streakVisibility?: StudyProfileVisibility;
  showLevel?: boolean;
  showAttempt?: boolean;
};

export type VisibleStudyProfile = {
  userId: string;
  displayName: string;
  publicBio: string | null;
  relationship: StudyProfileRelationship;
  caLevel?: string;
  attemptKey?: string;
  progress?: StudyProfileSerializerSource["progress"];
  streak?: StudyProfileSerializerSource["streak"];
};

export function serializeStudyProfile(input: {
  source: StudyProfileSerializerSource;
  settings?: StudyProfileSerializerSettings | null;
  relationship: StudyProfileRelationship;
}): VisibleStudyProfile | null;
