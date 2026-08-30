export const ICAI_RESOURCE_TYPES = [
  "rtp",
  "mtp",
  "study_material",
  "statutory_update",
  "amendment",
  "question_paper",
  "suggested_answer",
  "schedule",
  "announcement",
] as const;

export type IcaiResourceType = (typeof ICAI_RESOURCE_TYPES)[number];
export type IcaiLevelCode = "foundation" | "intermediate" | "final";

export type IcaiSourceConfig = {
  id: string;
  name: string;
  sourceType: string;
  officialUrl: string;
  adapterKey: "anchor_feed" | "resource_hub";
  adapterConfig: Record<string, unknown>;
  levelCodes: IcaiLevelCode[];
  resourceTypes: IcaiResourceType[];
  trustLevel: "standard" | "high_impact";
  authoritativeListing: boolean;
  parserVersion: string;
  timeoutMs: number;
  requestIntervalSeconds: number;
  lastContentHash: string | null;
  etag: string | null;
  lastModified: string | null;
};

export type ParsedOfficialLink = { title: string; url: string };
export type ParsedIcaiResource = {
  title: string;
  officialUrl: string;
  summary: string | null;
  resourceType: IcaiResourceType;
  levelCodes: IcaiLevelCode[];
  attemptKeys: string[];
  subjectIds: string[];
  publishedOn: string | null;
};
export type ParsedExamAttempt = {
  attemptKey: string;
  label: string;
  levelCodes: IcaiLevelCode[];
  startDate: string | null;
  endDate: string | null;
  confidence: number;
};
export type ParsedExamEvent = {
  attemptKey: string;
  levelCode: IcaiLevelCode;
  eventType: "exam_paper" | "schedule_release";
  title: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  subjectId: string | null;
  sourceUrl: string;
  confidence: number;
};
export type ParsedSourcePayload = {
  resources: ParsedIcaiResource[];
  attempts: ParsedExamAttempt[];
  events: ParsedExamEvent[];
};

export type IcaiSyncSummary = {
  runId: string;
  status: "success" | "partial" | "failed";
  sourceTotal: number;
  sourceSucceeded: number;
  sourceFailed: number;
  newItems: number;
  changedItems: number;
  unchangedItems: number;
  removedItems: number;
  pendingReviews: number;
};

export type IcaiPublicFilters = {
  level?: string | null;
  attempt?: string | null;
  subject?: string | null;
  type?: string | null;
};

export type IcaiResourceCard = {
  id: string;
  type: IcaiResourceType;
  title: string;
  summary: string | null;
  officialUrl: string;
  sourceName: string;
  sourceUrl: string;
  firstSeenAt: string;
  lastVerifiedAt: string;
  lastChangedAt: string;
  publishedOn: string | null;
  status: string;
  levelCodes: string[];
  attemptKeys: string[];
  subjects: { id: string; title: string }[];
};

export type IcaiExamEventCard = {
  id: string;
  title: string;
  eventType: string;
  eventDate: string;
  attemptKey: string;
  attemptLabel: string;
  levelCode: string;
  sourceUrl: string;
  lastVerifiedAt: string;
};

export type IcaiPublicCatalog = {
  resources: IcaiResourceCard[];
  events: IcaiExamEventCard[];
  levels: { code: string; name: string }[];
  attempts: { id: string; key: string; label: string; levelCode: string }[];
  subjects: { id: string; title: string; levelCode: string }[];
  filters: Required<IcaiPublicFilters>;
  verifiedAt: string | null;
};

export type IcaiAdminDashboard = {
  latestRun: {
    id: string;
    status: string;
    triggerType: string;
    startedAt: string;
    completedAt: string | null;
    sourceTotal: number;
    sourceSucceeded: number;
    sourceFailed: number;
    newItems: number;
    changedItems: number;
    unchangedItems: number;
    removedItems: number;
    pendingReviews: number;
    errorSummary: string | null;
  } | null;
  sources: {
    id: string;
    name: string;
    officialUrl: string;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastError: string | null;
    failures: number;
    parserVersion: string;
    lastContentHash: string | null;
    trustLevel: string;
    authoritativeListing: boolean;
    isActive: boolean;
  }[];
  reviews: {
    id: string;
    title: string;
    reason: string;
    entityType: string;
    entityId: string;
    confidence: number;
    sourceName: string;
    sourceUrl: string;
    createdAt: string;
  }[];
  recentChanges: {
    id: number;
    entityType: string;
    entityId: string;
    changeType: string;
    riskLevel: string;
    decisionStatus: string;
    detectedAt: string;
  }[];
};
