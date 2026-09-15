export const STUDY_PROFILE_VISIBILITIES = Object.freeze(["private", "buddies", "public"]);

export const PRIVATE_STUDY_PROFILE_DEFAULTS = Object.freeze({
  profileVisibility: "private",
  progressVisibility: "private",
  streakVisibility: "private",
  showLevel: false,
  showAttempt: false,
});

export function normalizeStudyProfileVisibility(value) {
  return STUDY_PROFILE_VISIBILITIES.includes(value) ? value : "private";
}

export function canViewStudyProfileScope(scope, relationship) {
  if (relationship === "owner") return true;
  const visibility = normalizeStudyProfileVisibility(scope);
  if (visibility === "public") return true;
  return visibility === "buddies" && relationship === "buddy";
}

export function serializeStudyProfile({ source, settings, relationship }) {
  const effective = {
    ...PRIVATE_STUDY_PROFILE_DEFAULTS,
    ...(settings || {}),
    profileVisibility: normalizeStudyProfileVisibility(settings?.profileVisibility),
    progressVisibility: normalizeStudyProfileVisibility(settings?.progressVisibility),
    streakVisibility: normalizeStudyProfileVisibility(settings?.streakVisibility),
    showLevel: settings?.showLevel === true,
    showAttempt: settings?.showAttempt === true,
  };

  if (!canViewStudyProfileScope(effective.profileVisibility, relationship)) return null;

  // Deliberately construct a new allowlisted representation. Never spread a database
  // row here: hidden academic fields must be absent from API responses, not nulled.
  const output = {
    userId: String(source.userId),
    displayName: String(source.displayName || "Student"),
    publicBio: typeof source.publicBio === "string" && source.publicBio.trim() ? source.publicBio.trim() : null,
    relationship,
  };

  if (relationship === "owner" || effective.showLevel) {
    if (source.caLevel) output.caLevel = String(source.caLevel);
  }
  if (relationship === "owner" || effective.showAttempt) {
    if (source.attemptKey) output.attemptKey = String(source.attemptKey);
  }
  if (canViewStudyProfileScope(effective.progressVisibility, relationship) && source.progress) {
    output.progress = {
      firstCoveragePercent: Number(source.progress.firstCoveragePercent || 0),
      revisionReadinessPercent: Number(source.progress.revisionReadinessPercent || 0),
      testingReadinessPercent: Number(source.progress.testingReadinessPercent || 0),
    };
  }
  if (canViewStudyProfileScope(effective.streakVisibility, relationship) && source.streak) {
    output.streak = {
      currentStreakDays: Number(source.streak.currentStreakDays || 0),
      activeDaysLast14: Number(source.streak.activeDaysLast14 || 0),
    };
  }

  return output;
}
