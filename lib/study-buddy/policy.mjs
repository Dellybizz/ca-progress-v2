export const STUDY_BUDDY_NUDGE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const STUDY_BUDDY_NUDGE_LIMIT = 3;
export const STUDY_BUDDY_INVITE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const STUDY_BUDDY_INVITE_LIMIT = 3;
export const STUDY_BUDDY_MIN_VALID_SESSION_SECONDS = 60;

export function canAccessStudyBuddyData(status, blocked = false) {
  return status === "accepted" && blocked !== true;
}

export function canSendStudyBuddyNudge({ status, blocked = false, mutedByRecipient = false, recentCount = 0 }) {
  return canAccessStudyBuddyData(status, blocked) && mutedByRecipient !== true && Number(recentCount) < STUDY_BUDDY_NUDGE_LIMIT;
}

export function canSendStudyTogetherInvite({ status, blocked = false, mutedByRecipient = false, recentCount = 0, hasActive = false }) {
  return canAccessStudyBuddyData(status, blocked)
    && mutedByRecipient !== true
    && hasActive !== true
    && Number(recentCount) < STUDY_BUDDY_INVITE_LIMIT;
}

export function normalizeStudyBuddySharing(input = {}) {
  return {
    shareProfile: input.shareProfile === true,
    shareProgress: input.shareProgress === true,
    shareStreak: input.shareStreak === true,
    shareGoals: input.shareGoals === true,
    shareStudyStatus: input.shareStudyStatus === true,
  };
}

export function studySessionContributionMinutes(durationSeconds) {
  const seconds = Number(durationSeconds);
  if (!Number.isFinite(seconds) || seconds < STUDY_BUDDY_MIN_VALID_SESSION_SECONDS) return 0;
  return Math.max(1, Math.floor(seconds / 60));
}

export function canAttachStudyTogetherSession({ ownsSession, durationSeconds, alreadyAttached = false, overlapsTogether = false }) {
  return ownsSession === true
    && studySessionContributionMinutes(durationSeconds) > 0
    && alreadyAttached !== true
    && overlapsTogether === true;
}

export function canonicalBuddyPair(userId, buddyUserId) {
  const a = String(userId || "");
  const b = String(buddyUserId || "");
  return a < b ? [a, b] : [b, a];
}
