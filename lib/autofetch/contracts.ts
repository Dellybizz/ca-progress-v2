export const AUTOFETCH_SOURCE_HEALTH = [
  "healthy",
  "degraded",
  "discovery_running",
  "parser_anomaly",
  "review_required",
  "disabled",
] as const;

export const AUTOFETCH_DISCOVERY_METHODS = [
  "redirect",
  "parent_index",
  "sitemap",
  "official_search",
  "external_search",
  "manual",
] as const;

export const AUTOFETCH_RESOURCE_HEALTH = ["healthy", "stale", "broken", "review_required"] as const;
export const AUTOFETCH_CRITICALITY = ["routine", "high_impact", "critical"] as const;
export const AUTOFETCH_PUBLISH_POLICIES = ["verified_auto", "review_high_impact", "manual_only"] as const;

export type AutofetchSourceHealth = (typeof AUTOFETCH_SOURCE_HEALTH)[number];
export type AutofetchDiscoveryMethod = (typeof AUTOFETCH_DISCOVERY_METHODS)[number];
export type AutofetchResourceHealth = (typeof AUTOFETCH_RESOURCE_HEALTH)[number];
export type AutofetchCriticality = (typeof AUTOFETCH_CRITICALITY)[number];
export type AutofetchPublishPolicy = (typeof AUTOFETCH_PUBLISH_POLICIES)[number];

export type AutofetchAcademicScope = {
  canonicalNodeId?: string | null;
  levelId?: string | null;
  groupId?: string | null;
  subjectId?: string | null;
  attemptId?: string | null;
};

export type AutofetchContentTarget = AutofetchAcademicScope & {
  id: string;
  organization: string;
  contentType: string;
  expectedTitlePatterns: string[];
  expectedKeywords: string[];
  expectedDocumentTypes: string[];
  criticality: AutofetchCriticality;
  autoPublishPolicy: AutofetchPublishPolicy;
  enabled: boolean;
};

export type AutofetchSourceLocation = {
  sourceId: string;
  url: string;
  locationType: "source_page" | "discovery_root" | "redirect_target" | "historical";
  status: "current" | "previous" | "redirected" | "broken" | "review_required";
  firstSeenAt: string;
  lastSeenAt: string;
  redirectedToUrl?: string | null;
  contentHash?: string | null;
  httpStatus?: number | null;
};

export type AutofetchDiscoveryCandidate = {
  sourceId: string;
  targetId?: string | null;
  candidateUrl: string;
  discoveredVia: AutofetchDiscoveryMethod;
  confidence: number;
  verificationStatus: "pending" | "verified" | "rejected" | "review_required";
  reasons: string[];
  contentFingerprint?: string | null;
};

export type CanonicalResourceIdentityInput = {
  sourceId: string;
  resourceType: string;
  title: string;
  publishedOn?: string | null;
  levelCodes?: readonly string[];
  attemptKeys?: readonly string[];
};

function normalizedText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function normalizedSet(values: readonly string[] | undefined) {
  return [...new Set((values ?? []).map(normalizedText).filter(Boolean))].sort();
}

/**
 * Stable semantic identity material. URL is deliberately excluded: moving an
 * official page/document must not create a new product identity.
 *
 * The D1 Phase 0 migration stores an encoded form of the same fields. Later
 * discovery adapters may supply a stronger explicit target identity (for
 * example accounting_standard_1) while preserving this compatibility key.
 */
export function canonicalResourceIdentityMaterial(input: CanonicalResourceIdentityInput) {
  return [
    normalizedText(input.sourceId),
    normalizedText(input.resourceType),
    normalizedText(input.title),
    input.publishedOn?.trim() ?? "",
    JSON.stringify(normalizedSet(input.levelCodes)),
    JSON.stringify(normalizedSet(input.attemptKeys)),
  ].join("|");
}

export function isLikelyDirectDocumentUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return /\.(pdf|doc|docx|xls|xlsx|zip)$/.test(path) || host === "resource.cdn.icai.org" || host.endsWith(".resource.cdn.icai.org");
  } catch {
    return false;
  }
}

export const AUTOFETCH_RECOVERY_ORDER: readonly AutofetchDiscoveryMethod[] = [
  "redirect",
  "parent_index",
  "sitemap",
  "official_search",
  "external_search",
  "manual",
] as const;

export function requiresCriticalReview(input: { criticality: AutofetchCriticality; confidence: number; corroborated: boolean }) {
  if (input.criticality === "routine") return input.confidence < 0.9;
  if (input.criticality === "high_impact") return input.confidence < 0.98 || !input.corroborated;
  return !input.corroborated || input.confidence < 0.995;
}
