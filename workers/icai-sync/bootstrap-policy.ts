import type { IcaiSourceConfig, ParsedIcaiResource, ParsedSourcePayload } from "../../lib/icai/types";

export type IcaiWindowMode = "bootstrap" | "incremental";

export type IcaiWindowResult = {
  payload: ParsedSourcePayload;
  mode: IcaiWindowMode;
  filteredCount: number;
  attemptFloor: string;
  publishedFloor: string;
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

function resourceEligible(
  resource: ParsedIcaiResource,
  attemptFloor: string,
  publishedFloor: string,
) {
  if (resource.attemptKeys.some((key) => attemptAtOrAfter(key, attemptFloor))) return true;
  if (resource.publishedOn && resource.publishedOn >= publishedFloor) return true;

  // ICAI Study Material landing pages and chapter PDFs are frequently undated.
  // Keep undated Study Material discoverable for the current syllabus, while
  // dated historical notices/resources still obey the bounded window.
  if (resource.resourceType === "study_material" && !resource.publishedOn) return true;
  return false;
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

  const resources = payload.resources.filter((resource) =>
    resourceEligible(resource, attemptFloor, publishedFloor),
  );
  const attempts = payload.attempts.filter((attempt) =>
    attemptAtOrAfter(attempt.attemptKey, attemptFloor),
  );
  const events = payload.events.filter((event) =>
    attemptAtOrAfter(event.attemptKey, attemptFloor),
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
