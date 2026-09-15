const DAY_MS = 86_400_000;

export const PHASE9_FORECAST_POLICY = Object.freeze({
  lookbackDays: 28,
  minimumRecentCompletions: 3,
  minimumObservationDays: 7,
  minimumDistinctCompletionDays: 2,
  staleAfterDays: 14,
  revisionBufferDays: 30,
});

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isFinite(date.valueOf()) ? date : null;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function diffDays(later, earlier) {
  return Math.floor((later.valueOf() - earlier.valueOf()) / DAY_MS);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function evaluateBaselineForecast(input) {
  const now = parseDate(input.now) ?? new Date();
  const totalChapters = Math.max(0, Number(input.totalChapters) || 0);
  const completedChapters = Math.min(totalChapters, Math.max(0, Number(input.completedChapters) || 0));
  const remainingChapters = Math.max(0, totalChapters - completedChapters);
  const completionPercent = totalChapters ? Math.round((completedChapters / totalChapters) * 100) : 0;
  const verifiedAttempt = parseDate(input.verifiedAttemptDate);
  const recommendedTarget = verifiedAttempt ? addDays(verifiedAttempt, -PHASE9_FORECAST_POLICY.revisionBufferDays) : null;

  const base = {
    eligible: false,
    status: "insufficient_data",
    reasons: [],
    totalChapters,
    completedChapters,
    remainingChapters,
    completionPercent,
    observedChaptersPerWeek: null,
    requiredChaptersPerWeek: null,
    projectedCompletionDate: null,
    recommendedTargetDate: recommendedTarget ? isoDay(recommendedTarget) : null,
    verifiedAttemptDate: verifiedAttempt ? isoDay(verifiedAttempt) : null,
    observationDays: 0,
    recentCompletionCount: 0,
    distinctCompletionDays: 0,
  };

  if (totalChapters === 0) {
    base.reasons.push("No applicable chapters are available for this profile.");
    return base;
  }

  if (remainingChapters === 0) {
    return {
      ...base,
      eligible: true,
      status: "complete",
      projectedCompletionDate: isoDay(now),
      reasons: [],
    };
  }

  if (!verifiedAttempt) {
    base.reasons.push("A verified exam date is required before CA Progress compares your pace with the attempt.");
  } else if (verifiedAttempt <= now) {
    base.reasons.push("The verified attempt date is not in the future, so a current completion forecast is not shown.");
  }

  if (verifiedAttempt && verifiedAttempt > now) {
    const paceTarget = recommendedTarget && recommendedTarget > now ? recommendedTarget : verifiedAttempt;
    const weeksAvailable = Math.max(1 / 7, (paceTarget.valueOf() - now.valueOf()) / DAY_MS / 7);
    base.requiredChaptersPerWeek = round2(remainingChapters / weeksAvailable);
  }

  const lookback = addDays(now, -PHASE9_FORECAST_POLICY.lookbackDays);
  const recent = (Array.isArray(input.completionDates) ? input.completionDates : [])
    .map(parseDate)
    .filter((date) => date && date <= now && date >= lookback)
    .sort((a, b) => a.valueOf() - b.valueOf());
  base.recentCompletionCount = recent.length;
  base.distinctCompletionDays = new Set(recent.map(isoDay)).size;

  if (recent.length < PHASE9_FORECAST_POLICY.minimumRecentCompletions) {
    base.reasons.push(`Record at least ${PHASE9_FORECAST_POLICY.minimumRecentCompletions} chapter completions within ${PHASE9_FORECAST_POLICY.lookbackDays} days before projecting your pace.`);
  }

  if (recent.length) {
    base.observationDays = Math.max(0, diffDays(now, recent[0]));
    const stalenessDays = Math.max(0, diffDays(now, recent[recent.length - 1]));
    if (base.observationDays < PHASE9_FORECAST_POLICY.minimumObservationDays) {
      base.reasons.push(`Observe completion activity for at least ${PHASE9_FORECAST_POLICY.minimumObservationDays} days before projecting a finish date.`);
    }
    if (base.distinctCompletionDays < PHASE9_FORECAST_POLICY.minimumDistinctCompletionDays) {
      base.reasons.push(`Chapter completions must span at least ${PHASE9_FORECAST_POLICY.minimumDistinctCompletionDays} separate days before a pace forecast is shown.`);
    }
    if (stalenessDays > PHASE9_FORECAST_POLICY.staleAfterDays) {
      base.reasons.push(`Your latest chapter completion is more than ${PHASE9_FORECAST_POLICY.staleAfterDays} days old, so the recent pace is too stale to project.`);
    }
  } else {
    base.reasons.push("No recent chapter completion evidence is available yet.");
  }

  if (base.reasons.length) return base;

  const observedWeeks = Math.max(1, base.observationDays) / 7;
  const observedChaptersPerWeek = round2(recent.length / observedWeeks);
  if (!(observedChaptersPerWeek > 0) || !verifiedAttempt) return base;

  const projected = addDays(now, Math.ceil((remainingChapters / observedChaptersPerWeek) * 7));
  let status = "behind";
  if (recommendedTarget && recommendedTarget > now && projected <= recommendedTarget) status = "ahead";
  else if (projected <= verifiedAttempt) status = "at_risk";

  return {
    ...base,
    eligible: true,
    status,
    reasons: [],
    observedChaptersPerWeek,
    projectedCompletionDate: isoDay(projected),
  };
}
