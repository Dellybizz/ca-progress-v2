export type MentorConfidenceLevel = "insufficient" | "experimental" | "low" | "medium" | "high";

export type MentorSourceKind =
  | "icai_study_material"
  | "icai_syllabus"
  | "icai_rtp"
  | "icai_mtp_series_1"
  | "icai_mtp_series_2"
  | "icai_question_paper"
  | "icai_suggested_answer"
  | "icai_mcq"
  | "icai_amendment"
  | "icai_bos_learning"
  | "trusted_faculty"
  | "community"
  | "internal_user_outcome"
  | "verified_high_performer"
  | "verified_air";

export type MentorAuthorityTier =
  | "untrusted"
  | "official_icai"
  | "trusted_external"
  | "community"
  | "internal_unverified"
  | "internal_verified";

export type MentorVerificationTier =
  | "unverified"
  | "self_reported"
  | "evidence_uploaded"
  | "admin_verified"
  | "official_verified";

export type MentorModelKey =
  | "exam_intelligence"
  | "preparation_intelligence"
  | "student_model"
  | "forecast_model"
  | "source_weights";

export type MentorAcademicScopeKind = "subject" | "chapter" | "topic";
export type MentorIntelligenceProvenance = "preprocessed" | "personalized" | "cohort";

export type MentorPersonalizationState =
  | "unavailable"
  | "collecting_data"
  | "early_estimate"
  | "personalized"
  | "high_confidence";

export type MentorPersonalizationMetricKey =
  | "pace_estimate"
  | "weak_area"
  | "revision_timing"
  | "workload_forecast"
  | "sustainable_capacity"
  | "retention_risk"
  | "similar_students";

export type MentorAttemptRef = {
  attemptId: string;
  attemptKey?: string;
  levelId?: string;
};

export type MentorAcademicRef = {
  subjectId: string;
  syllabusVersionId?: string | null;
  chapterId?: string | null;
  topicId?: string | null;
  scopeKind: MentorAcademicScopeKind;
};

export type MentorModelVersionContract = {
  id: string;
  modelKey: MentorModelKey;
  version: string;
  status: "draft" | "active" | "retired";
  config: Record<string, unknown>;
  publicMetadata: Record<string, unknown>;
  activatedAt: string | null;
  retiredAt: string | null;
};

export type MentorIntelligenceSourceContract = {
  id: string;
  sourceKind: MentorSourceKind;
  title: string;
  sourceUrl: string | null;
  authorityTier: MentorAuthorityTier;
  authorityWeight: number;
  verificationTier: MentorVerificationTier;
  verificationStatus: "pending" | "verified" | "rejected";
  attemptId: string | null;
  academic: Partial<MentorAcademicRef>;
  publishedOn: string | null;
  attemptRelevance: number;
  mappingConfidence: number;
  evidenceQuality: number;
  processingVersion: string;
  visibility: "internal" | "published";
};

export type MentorEvidenceContract = {
  id: string;
  sourceId: string;
  attemptId: string | null;
  academic: Partial<MentorAcademicRef>;
  evidenceKind:
    | "weightage"
    | "occurrence"
    | "marks"
    | "amendment"
    | "effort"
    | "strategy"
    | "difficulty"
    | "outcome_pattern"
    | "other";
  normalizedValue: number | null;
  normalizedUnit: string | null;
  evidenceText: string | null;
  sourceAuthorityTier: MentorAuthorityTier;
  confidenceLevel: MentorConfidenceLevel;
  confidenceScore: number;
  mappingConfidence: number;
  evidenceQualityScore: number;
  sampleSize: number;
  visibility: "internal" | "published";
};

export type MentorIntelligenceContract = {
  id: string;
  attemptId: string | null;
  academic: MentorAcademicRef;
  modelVersionId: string;
  score?: number;
  metrics?: Record<string, unknown>;
  confidenceLevel: MentorConfidenceLevel;
  confidenceScore: number;
  evidenceSummary: Record<string, unknown>;
  explanation: string | null;
  calculatedAt: string;
  isPublished: boolean;
};

export type MentorEligibilityMinimums = {
  observationDays: number;
  studyMinutes: number;
  timedSessions: number;
  completedChapters: number;
  revisionEvents: number;
  tests: number;
  distinctSubjects: number;
  cohortSampleSize: number;
};

export type MentorPersonalizationRule = {
  metricKey: MentorPersonalizationMetricKey;
  displayName: string;
  enabled: boolean;
  minimums: MentorEligibilityMinimums;
};

export type MentorStudentEvidenceSnapshot = {
  observationDays: number;
  studyMinutes: number;
  timedSessions: number;
  completedChapters: number;
  revisionEvents: number;
  tests: number;
  distinctSubjects: number;
  cohortSampleSize: number;
};

export type MentorEligibilityDecision = {
  metricKey: MentorPersonalizationMetricKey;
  state: MentorPersonalizationState;
  confidenceLevel: MentorConfidenceLevel;
  canExposePersonalizedData: boolean;
  progress: number;
  unmetRequirements: string[];
};

export type MentorRecommendationReason = {
  key: string;
  label: string;
  contribution?: number | null;
  evidenceIds?: string[];
};

export type MentorRecommendationExplanationContract = {
  id: string;
  userId: string;
  metricKey: MentorPersonalizationMetricKey | null;
  provenance: MentorIntelligenceProvenance;
  attemptId: string | null;
  academic?: Partial<MentorAcademicRef>;
  actionKey: string;
  priorityScore: number | null;
  confidenceLevel: MentorConfidenceLevel;
  summary: string;
  reasons: MentorRecommendationReason[];
  evidenceRefs: string[];
  modelVersionId: string | null;
};
