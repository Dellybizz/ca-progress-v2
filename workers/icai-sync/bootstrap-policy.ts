import type {
  IcaiLevelCode,
  IcaiSourceConfig,
  ParsedIcaiResource,
  ParsedSourcePayload,
} from "../../lib/icai/types";

export type IcaiWindowMode = "bootstrap" | "incremental";

export type IcaiWindowResult = {
  payload: ParsedSourcePayload;
  mode: IcaiWindowMode;
  filteredCount: number;
  attemptFloor: string;
  publishedFloor: string;
};

const ATTEMPT_MONTHS_BY_LEVEL: Record<IcaiLevelCode, ReadonlySet<string>> = {
  foundation: new Set(["01", "05", "09"]),
  intermediate: new Set(["01", "05", "09"]),
  final: new Set(["05", "11"]),
};

function configString(source: IcaiSourceConfig, key: string, fallback: string) {
  const value = source.adapterConfig[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bootstrapComplete(source: IcaiSourceConfig) {
  return source.adapterConfig.bootstrap_complete === true;
}

function validAttemptKey(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function attemptAtOrAfter(value: string, floor: string) {
  return validAttemptKey(value) && validAttemptKey(floor) && value >= floor;
}

function attemptAllowedForLevel(value: string, level: IcaiLevelCode) {
  if (!validAttemptKey(value)) return false;
  return ATTEMPT_MONTHS_BY_LEVEL[level].has(value.slice(5, 7));
}

function allowedLevels(value: string, levels: IcaiLevelCode[]) {
  return levels.filter((level) => attemptAllowedForLevel(value, level));
}

function resourceEligible(
  resource: ParsedIcaiResource,
  attemptFloor: string,
  publishedFloor: string,
) {
  if (resource.attemptKeys.some((key) => attemptAtOrAfter(key, attemptFloor))) return true;
  if (resource.publishedOn && resource.publishedOn >= publishedFloor) return true;

  // Current ICAI Study Material chapter links are commonly undated. They are
  // accepted only because Phase 1 points resource_hub sources at the explicit
  // New Scheme course hubs instead of historical course-category archives.
  if (resource.resourceType === "study_material" && !resource.publishedOn) return true;
  return false;
}

function normalizeResourceAttemptScope(resource: ParsedIcaiResource) {
  if (!resource.attemptKeys.length) return resource;

  const validKeys = resource.attemptKeys.filter((key) =>
    resource.levelCodes.some((level) => attemptAllowedForLevel(key, level)),
  );
  if (!validKeys.length) return null;

  if (validKeys.length === 1) {
    const levelCodes = allowedLevels(validKeys[0], resource.levelCodes);
    return levelCodes.length
      ? { ...resource, attemptKeys: validKeys, levelCodes }
      : null;
  }

  // A shared notice such as "September & November 2026" cannot be represented
  // safely by the resource schema because attemptIds are generated as a
  // level×attempt cross product. Keep it as general official evidence unless
  // every listed attempt is valid for every listed level.
  const everyKeyAppliesToEveryLevel = validKeys.every((key) =>
    resource.levelCodes.every((level) => attemptAllowedForLevel(key, level)),
  );
  return {
    ...resource,
    attemptKeys: everyKeyAppliesToEveryLevel ? validKeys : [],
  };
}

export function applyIcaiWindowPolicy(
  payload: ParsedSourcePayload,
  source: IcaiSourceConfig,
  now = new Date(),
): IcaiWindowResult {
  const mode: IcaiWindowMode = bootstrapComplete(source) ? "incremental" : "bootstrap";
  const attemptFloor = configString(source, "bootstrap_attempt_floor", "2026-05");
  const configuredPublishedFloor = configString(source, "bootstrap_published_floor", "2025-12-01");
  const completedAt = configString(source, "bootstrap_completed_at", "");
  const incrementalFloor = /^\d{4}-\d{2}-\d{2}/.test(completedAt)
    ? completedAt.slice(0, 10)
    : now.toISOString().slice(0, 10);
  const publishedFloor = mode === "bootstrap" ? configuredPublishedFloor : incrementalFloor;

  const eligibleResources = payload.resources.filter((resource) =>
    resourceEligible(resource, attemptFloor, publishedFloor),
  );
  const resources = eligibleResources
    .map(normalizeResourceAttemptScope)
    .filter((resource): resource is ParsedIcaiResource => Boolean(resource));

  const attempts = payload.attempts
    .filter((attempt) => attemptAtOrAfter(attempt.attemptKey, attemptFloor))
    .map((attempt) => ({
      ...attempt,
      levelCodes: allowedLevels(attempt.attemptKey, attempt.levelCodes),
    }))
    .filter((attempt) => attempt.levelCodes.length > 0);

  const events = payload.events.filter((event) =>
    attemptAtOrAfter(event.attemptKey, attemptFloor) &&
    attemptAllowedForLevel(event.attemptKey, event.levelCode),
  );

  return {
    payload: { resources, attempts, events },
    mode,
    filteredCount:
      payload.resources.length - resources.length +
      payload.attempts.length - attempts.length +
      payload.events.length - events.length,
    attemptFloor,
    publishedFloor,
  };
}

export function completedAdapterConfig(source: IcaiSourceConfig, completedAt: string) {
  return {
    ...source.adapterConfig,
    bootstrap_complete: true,
    bootstrap_completed_at: completedAt,
  };
}
