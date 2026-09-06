export const STUDY_BUDDY_NUDGE_WINDOW_MS: number;
export const STUDY_BUDDY_NUDGE_LIMIT: number;
export const STUDY_BUDDY_MIN_VALID_SESSION_SECONDS: number;

export function canAccessStudyBuddyData(status: string, blocked?: boolean): boolean;
export function canSendStudyBuddyNudge(input: {
  status: string;
  blocked?: boolean;
  mutedByRecipient?: boolean;
  recentCount?: number;
}): boolean;
export function normalizeStudyBuddySharing(input?: Record<string, unknown>): {
  shareProfile: boolean;
  shareProgress: boolean;
  shareStreak: boolean;
  shareGoals: boolean;
  shareStudyStatus: boolean;
};
export function studySessionContributionMinutes(durationSeconds: unknown): number;
export function canAttachStudyTogetherSession(input: {
  ownsSession: boolean;
  durationSeconds: unknown;
  alreadyAttached?: boolean;
  overlapsTogether?: boolean;
}): boolean;
export function canonicalBuddyPair(userId: unknown, buddyUserId: unknown): [string, string];
