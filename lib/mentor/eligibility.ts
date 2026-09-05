import type {
  MentorConfidenceLevel,
  MentorEligibilityDecision,
  MentorEligibilityMinimums,
  MentorPersonalizationMetricKey,
  MentorPersonalizationRule,
  MentorPersonalizationState,
  MentorStudentEvidenceSnapshot,
} from "@/lib/mentor/types";

const minimums = (value: Partial<MentorEligibilityMinimums>): MentorEligibilityMinimums => ({
  observationDays: value.observationDays ?? 0,
  studyMinutes: value.studyMinutes ?? 0,
  timedSessions: value.timedSessions ?? 0,
  completedChapters: value.completedChapters ?? 0,
  revisionEvents: value.revisionEvents ?? 0,
  tests: value.tests ?? 0,
  distinctSubjects: value.distinctSubjects ?? 0,
  cohortSampleSize: value.cohortSampleSize ?? 0,
});

export const DEFAULT_PERSONALIZATION_RULES: Record<MentorPersonalizationMetricKey, MentorPersonalizationRule> = {
  pace_estimate: {
    metricKey: "pace_estimate",
    displayName: "Personal pace estimate",
    enabled: true,
    minimums: minimums({ observationDays: 3, studyMinutes: 180, timedSessions: 5 }),
  },
  weak_area: {
    metricKey: "weak_area",
    displayName: "Performance-based weak areas",
    enabled: true,
    minimums: minimums({ observationDays: 7, completedChapters: 2, tests: 3 }),
  },
  revision_timing: {
    metricKey: "revision_timing",
    displayName: "Personal revision timing",
    enabled: true,
    minimums: minimums({ observationDays: 3, studyMinutes: 120, timedSessions: 3, completedChapters: 1, revisionEvents: 1 }),
  },
  workload_forecast: {
    metricKey: "workload_forecast",
    displayName: "Personal workload forecast",
    enabled: true,
    minimums: minimums({ observationDays: 7, studyMinutes: 300, timedSessions: 7, completedChapters: 3 }),
  },
  sustainable_capacity: {
    metricKey: "sustainable_capacity",
    displayName: "Sustainable study capacity",
    enabled: true,
    minimums: minimums({ observationDays: 7, studyMinutes: 300, timedSessions: 5 }),
  },
  retention_risk: {
    metricKey: "retention_risk",
    displayName: "Personal retention risk",
    enabled: true,
    minimums: minimums({ observationDays: 7, studyMinutes: 180, completedChapters: 1, revisionEvents: 2, tests: 2 }),
  },
  similar_students: {
    metricKey: "similar_students",
    displayName: "Students-like-you intelligence",
    enabled: true,
    minimums: minimums({ observationDays: 14, studyMinutes: 600, timedSessions: 10, completedChapters: 5, tests: 3, cohortSampleSize: 100 }),
  },
};

const snapshotKeys: Array<keyof MentorStudentEvidenceSnapshot> = [
  "observationDays",
  "studyMinutes",
  "timedSessions",
  "completedChapters",
  "revisionEvents",
  "tests",
  "distinctSubjects",
  "cohortSampleSize",
];

function confidenceForState(state: MentorPersonalizationState): MentorConfidenceLevel {
  if (state === "high_confidence") return "high";
  if (state === "personalized") return "medium";
  if (state === "early_estimate") return "low";
  if (state === "collecting_data") return "experimental";
  return "insufficient";
}

export function canExposePersonalizedData(state: MentorPersonalizationState): boolean {
  return state === "personalized" || state === "high_confidence";
}

export function evaluatePersonalizationEligibility(
  rule: MentorPersonalizationRule,
  snapshot: MentorStudentEvidenceSnapshot,
): MentorEligibilityDecision {
  if (!rule.enabled) {
    return {
      metricKey: rule.metricKey,
      state: "unavailable",
      confidenceLevel: "insufficient",
      canExposePersonalizedData: false,
      progress: 0,
      unmetRequirements: ["This personalised metric is currently disabled."],
    };
  }

  const relevantKeys = snapshotKeys.filter((key) => rule.minimums[key] > 0);
  const hasRelevantEvidence = relevantKeys.some((key) => snapshot[key] > 0);

  if (!hasRelevantEvidence) {
    return {
      metricKey: rule.metricKey,
      state: "unavailable",
      confidenceLevel: "insufficient",
      canExposePersonalizedData: false,
      progress: 0,
      unmetRequirements: relevantKeys.map((key) => `${key}: ${rule.minimums[key]} required`),
    };
  }

  const ratios = relevantKeys.map((key) => Math.min(1, snapshot[key] / rule.minimums[key]));
  const progress = ratios.length ? Math.round((ratios.reduce((sum, value) => sum + value, 0) / ratios.length) * 100) : 100;
  const allMet = relevantKeys.every((key) => snapshot[key] >= rule.minimums[key]);
  const allDouble = relevantKeys.length > 0 && relevantKeys.every((key) => snapshot[key] >= rule.minimums[key] * 2);
  const earlyEstimate = !allMet && relevantKeys.every((key) => snapshot[key] >= rule.minimums[key] * 0.75);

  let state: MentorPersonalizationState;
  if (allDouble) state = "high_confidence";
  else if (allMet) state = "personalized";
  else if (earlyEstimate) state = "early_estimate";
  else state = "collecting_data";

  return {
    metricKey: rule.metricKey,
    state,
    confidenceLevel: confidenceForState(state),
    canExposePersonalizedData: canExposePersonalizedData(state),
    progress,
    unmetRequirements: relevantKeys
      .filter((key) => snapshot[key] < rule.minimums[key])
      .map((key) => `${key}: ${snapshot[key]}/${rule.minimums[key]}`),
  };
}

export function chooseStudentIntelligence<T>(
  preprocessed: T,
  personalized: T | null | undefined,
  eligibility: MentorEligibilityDecision,
): T {
  if (eligibility.canExposePersonalizedData && personalized != null) return personalized;
  return preprocessed;
}
