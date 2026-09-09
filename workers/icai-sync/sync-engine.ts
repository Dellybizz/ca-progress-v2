import { parseOfficialSource } from "../../lib/icai/adapters";
import { sha256Hex, stableJson } from "../../lib/icai/hash";
import { isApprovedIcaiUrl } from "../../lib/icai/html";
import type {
  IcaiLevelCode,
  IcaiSourceConfig,
  IcaiSyncSummary,
  ParsedIcaiResource,
} from "../../lib/icai/types";
import { IcaiD1Client, type D1Database } from "./d1-client";
import {
  checkpoint,
  initializeRuntime,
  recoverStaleRuns,
  setStage,
  SyncCancelledError,
  SyncSourceSkippedError,
} from "./runtime-control";
import { applyIcaiWindowPolicy, completedAdapterConfig } from "./bootstrap-policy";
import { resolveDirectStudyMaterialPdfs } from "./direct-resource-resolver";

const PARSER_VERSION = "phase8.1";
const MAX_HTML_BYTES = 2_500_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
type Json = unknown;
type SourceRow = {
  id: string;
  name: string;
  source_type: string;
  official_url: string;
  adapter_key: string;
  adapter_config: unknown;
  level_codes: unknown;
  resource_types: unknown;
  trust_level: string;
  authoritative_listing: boolean;
  parser_version: string;
  timeout_ms: number;
  request_interval_seconds: number;
  last_content_hash: string | null;
  etag: string | null;
  last_modified: string | null;
};
type LevelRow = { id: string; code: string; is_active?: boolean };
type SubjectRow = {
  id: string;
  title: string;
  level_id: string;
  is_active?: boolean;
};
type AttemptRow = {
  id: string;
  level_id: string;
  attempt_key: string;
  start_date?: string | null;
  end_date?: string | null;
  verification_status?: string;
};
type RunRow = {
  id: string;
  source_total: number;
  source_succeeded: number;
  source_failed: number;
  new_items: number;
  changed_items: number;
  unchanged_items: number;
  removed_items: number;
  pending_reviews: number;
};
type AdminClient = IcaiD1Client;

export class IcaiSyncAlreadyRunningError extends Error {
  constructor() {
    super("An ICAI synchronization run is already in progress.");
    this.name = "IcaiSyncAlreadyRunningError";
  }
}

export type IcaiSyncRuntime = {
  db: D1Database;
  enabled: boolean;
  userAgent: string;
};
function adminClient(runtime: IcaiSyncRuntime): AdminClient {
  if (!runtime.db)
    throw new Error(
      "Cloudflare D1 configuration is missing for the ICAI sync service.",
    );
  return new IcaiD1Client(runtime.db);
}
function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function sourceDto(row: SourceRow): IcaiSourceConfig {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    officialUrl: row.official_url,
    adapterKey: row.adapter_key as IcaiSourceConfig["adapterKey"],
    adapterConfig: jsonObject(row.adapter_config),
    levelCodes: stringArray(row.level_codes) as IcaiLevelCode[],
    resourceTypes: stringArray(
      row.resource_types,
    ) as IcaiSourceConfig["resourceTypes"],
    trustLevel: row.trust_level as IcaiSourceConfig["trustLevel"],
    authoritativeListing: Boolean(row.authoritative_listing),
    parserVersion: row.parser_version,
    timeoutMs: Number(row.timeout_ms),
    requestIntervalSeconds: Number(row.request_interval_seconds),
    lastContentHash: row.last_content_hash,
    etag: row.etag,
    lastModified: row.last_modified,
  };
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function retryDelay(attempt: number) {
  return Math.min(8_000, 600 * 2 ** attempt) + Math.floor(Math.random() * 250);
}
function asErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === "string" && candidate.message.trim())
      return candidate.message;
    if (candidate.error && typeof candidate.error === "object") {
      const nested = candidate.error as Record<string, unknown>;
      if (typeof nested.message === "string" && nested.message.trim())
        return nested.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown ICAI sync failure (non-serializable error).";
    }
  }
  return String(error ?? "Unknown ICAI sync failure.");
}
function isApprovedHttpIcaiUrl(value: string) {
  if (!isApprovedIcaiUrl(value)) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

async function fetchFollowingApprovedRedirects(url: string, init: RequestInit) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isApprovedHttpIcaiUrl(current))
      throw new Error("Rejected redirect outside approved ICAI hosts.");
    const response = await fetch(current, { ...init, redirect:"manual" });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    if (hop === MAX_REDIRECTS)
      throw new Error(`ICAI source exceeded ${MAX_REDIRECTS} redirects.`);
    const location = response.headers.get("location");
    if (!location)
      throw new Error(
        `ICAI source returned redirect ${response.status} without a Location header.`,
      );
    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      throw new Error("ICAI source returned an invalid redirect URL.");
    }
    if (!isApprovedHttpIcaiUrl(next))
      throw new Error("Rejected redirect outside approved ICAI hosts.");
    current = next;
  }
  throw new Error("ICAI source redirect handling failed.");
}

async function fetchOfficialPage(
  source: IcaiSourceConfig,
  runtime: IcaiSyncRuntime,
) {
  if (!isApprovedIcaiUrl(source.officialUrl))
    throw new Error(`Rejected non-ICAI source URL for ${source.id}.`);
  if (!isApprovedHttpIcaiUrl(source.officialUrl))
    throw new Error(`Rejected non-HTTP ICAI source URL for ${source.id}.`);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), source.timeoutMs);
    try {
      const headers = new Headers({
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": runtime.userAgent,
      });
      if (source.etag) headers.set("If-None-Match", source.etag);
      if (source.lastModified)
        headers.set("If-Modified-Since", source.lastModified);
      const response = await fetchFollowingApprovedRedirects(
        source.officialUrl,
        {
          method: "GET",
          headers,
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (response.status === 304)
        return { response, html: "", bytes: 0, notModified: true };
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        if (attempt < 2 && Number.isFinite(retryAfter) && retryAfter > 0)
          await sleep(Math.min(retryAfter * 1_000, 15_000));
        throw new Error(`ICAI source returned ${response.status}`);
      }
      if (!response.ok)
        throw new Error(`ICAI source returned ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType))
        throw new Error(
          `Unexpected source content type: ${contentType || "unknown"}`,
        );
      const declaredLength = Number(
        response.headers.get("content-length") ?? "0",
      );
      if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES)
        throw new Error(
          "Official source page exceeded the Phase 8 HTML safety limit.",
        );
      const html = await response.text();
      const bytes = new TextEncoder().encode(html).byteLength;
      if (bytes > MAX_HTML_BYTES)
        throw new Error(
          "Official source page exceeded the Phase 8 HTML safety limit.",
        );
      return { response, html, bytes, notModified: false };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(retryDelay(attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Official ICAI source could not be fetched.");
}
function attemptId(levelCode: IcaiLevelCode, attemptKey: string) {
  return `attempt-${levelCode}-${attemptKey}`;
}
function subjectLevelCode(subject: SubjectRow, levels: Map<string, LevelRow>) {
  return levels.get(subject.level_id)?.code as IcaiLevelCode | undefined;
}
type ExistingResourceIdentityRow = {
  id: string;
  resource_type: string;
  title: string;
  official_url: string;
  metadata: unknown;
  subject_ids: string | null;
  status: string;
  last_seen_at: string;
};

type SourceWatermarkRow = {
  bootstrap_complete: number | boolean;
  bootstrap_completed_at: string | null;
  last_success_at: string | null;
  published_high_watermark: string | null;
  attempt_high_watermark: string | null;
};

function metadataObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function resourceSemanticKey(
  sourceId: string,
  resourceType: string,
  title: string,
  levelCodes: string[],
  subjectIds: string[],
) {
  const levels = [...new Set(levelCodes)].sort().join(",");
  const subjects = [...new Set(subjectIds)].sort().join(",");
  return ["v1", sourceId, resourceType, title.trim().toLowerCase(), levels, subjects].join("|");
}

async function existingResourceIdentityMaps(
  runtime: IcaiSyncRuntime,
  source: IcaiSourceConfig,
) {
  const result = await runtime.db
    .prepare(
      "SELECT r.id,r.resource_type,r.title,r.official_url,r.metadata,r.status,r.last_seen_at,COALESCE(group_concat(m.subject_id, char(31)),'') AS subject_ids FROM icai_resources r LEFT JOIN resource_subject_map m ON m.resource_id=r.id WHERE r.source_id=?1 GROUP BY r.id,r.resource_type,r.title,r.official_url,r.metadata,r.status,r.last_seen_at ORDER BY CASE WHEN r.status='active' THEN 0 ELSE 1 END,r.last_seen_at DESC,r.id ASC",
    )
    .bind(source.id)
    .all<ExistingResourceIdentityRow>();
  const existingByUrl = new Map<string, string>();
  const existingBySemantic = new Map<string, string>();
  for (const row of result.results ?? []) {
    existingByUrl.set(row.official_url, row.id);
    const metadata = metadataObject(row.metadata);
    const levelCodes = Array.isArray(metadata.level_codes)
      ? metadata.level_codes.filter((value): value is string => typeof value === "string")
      : [];
    const subjectIds = String(row.subject_ids ?? "")
      .split(String.fromCharCode(31))
      .filter(Boolean);
    const key = resourceSemanticKey(
      source.id,
      row.resource_type,
      row.title,
      levelCodes,
      subjectIds,
    );
    // Phase 1 may contain two legacy rows with the same broad title (for
    // example, "Initial Pages"). Exact URL identity still wins below; for a
    // replaced URL, retain the first active/newest row selected by the query.
    // Never abort the complete source merely because legacy data is ambiguous.
    if (!existingBySemantic.has(key)) existingBySemantic.set(key, row.id);
  }
  return { existingByUrl, existingBySemantic };
}

async function resourcePayload(
  source: IcaiSourceConfig,
  item: ParsedIcaiResource,
  attemptIdsByIdentity: Map<string, string>,
  existingByUrl: Map<string, string>,
  existingBySemantic: Map<string, string>,
) {
  const semanticKey = resourceSemanticKey(
    source.id,
    item.resourceType,
    item.title,
    item.levelCodes,
    item.subjectIds,
  );
  const id =
    existingByUrl.get(item.officialUrl) ??
    existingBySemantic.get(semanticKey) ??
    `icai-resource-${(await sha256Hex(semanticKey)).slice(0, 32)}`;
  const attemptIds = item.attemptKeys
    .flatMap((key) =>
      item.levelCodes.map((level) =>
        attemptIdsByIdentity.get(`${level}:${key}`),
      ),
    )
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index);
  const canonical = {
    type: item.resourceType,
    title: item.title,
    officialUrl: item.officialUrl,
    publishedOn: item.publishedOn,
    levelCodes: item.levelCodes.slice().sort(),
    attemptIds: attemptIds.slice().sort(),
    subjectIds: item.subjectIds.slice().sort(),
  };
  return {
    id,
    resource_type: item.resourceType,
    title: item.title,
    summary: item.summary ?? "",
    official_url: item.officialUrl,
    published_on: item.publishedOn ?? "",
    content_hash: await sha256Hex(stableJson(canonical)),
    parser_version: PARSER_VERSION,
    attempt_ids: attemptIds,
    subject_ids: item.subjectIds,
    metadata: {
      level_codes: item.levelCodes,
      attempt_keys: item.attemptKeys,
      semantic_key: semanticKey,
    },
  };
}

async function processSource(
  client: AdminClient,
  runtime: IcaiSyncRuntime,
  runId: string,
  source: IcaiSourceConfig,
  levels: LevelRow[],
  subjects: SubjectRow[],
  attempts: AttemptRow[],
) {
  const deadline = Date.now() + 2 * 60_000;
  const stage = async (
    value: Parameters<typeof setStage>[2],
    itemUrl = source.officialUrl,
  ) => {
    if (Date.now() > deadline)
      throw new Error("Source exceeded the two-minute processing limit.");
    await setStage(runtime.db, runId, value, source.id, itemUrl);
    await checkpoint(runtime.db, runId);
  };

  await stage("fetching");
  const fetched = await fetchOfficialPage(source, runtime);
  await stage("validating", fetched.response.url || source.officialUrl);
  const snapshotBase = {
    http_status: fetched.response.status,
    content_length: fetched.bytes,
    etag: fetched.response.headers.get("etag"),
    last_modified: fetched.response.headers.get("last-modified"),
    parser_version: PARSER_VERSION,
    metadata: {
      authoritative_listing: source.authoritativeListing,
      source_type: source.sourceType,
    },
  };
  if (fetched.notModified) {
    await stage("writing");
    const { error } = await client.rpc("icai_sync_record_unchanged", {
      p_run_id: runId,
      p_source_id: source.id,
      p_snapshot: {
        ...snapshotBase,
        canonical_hash:
          source.lastContentHash ?? `etag:${source.etag ?? source.id}`,
      } as Json,
    });
    if (error) throw error;
    return;
  }
  const levelById = new Map(levels.map((level) => [level.id, level]));
  const subjectLookups = subjects.flatMap((subject) => {
    const levelCode = subjectLevelCode(subject, levelById);
    return levelCode
      ? [{ id: subject.id, title: subject.title, levelCode }]
      : [];
  });
  await stage("parsing");
  const discovered = parseOfficialSource(fetched.html, source, subjectLookups);
  const discoveredItemCount =
    discovered.resources.length + discovered.attempts.length + discovered.events.length;
  const allowEmpty = source.adapterConfig.allow_empty === true;
  if (discoveredItemCount === 0 && !allowEmpty)
    throw new Error(
      "Parser returned zero academic items. Last verified data was preserved for review.",
    );

  const direct = await resolveDirectStudyMaterialPdfs(
    discovered,
    source,
    subjectLookups,
    runtime.userAgent,
  );
  const watermark = await runtime.db
    .prepare(
      "SELECT bootstrap_complete,bootstrap_completed_at,last_success_at,published_high_watermark,attempt_high_watermark FROM icai_source_watermarks WHERE source_id=?1 LIMIT 1",
    )
    .bind(source.id)
    .first<SourceWatermarkRow>();
  const policySource = watermark?.bootstrap_complete
    ? {
        ...source,
        adapterConfig: {
          ...source.adapterConfig,
          bootstrap_complete: true,
          bootstrap_completed_at:
            watermark.bootstrap_completed_at ??
            source.adapterConfig.bootstrap_completed_at,
        },
      }
    : source;
  const windowed = applyIcaiWindowPolicy(direct.payload, policySource);
  const parsed = windowed.payload;
  const parsedItemCount =
    parsed.resources.length + parsed.attempts.length + parsed.events.length;

  await stage("comparing");
  const canonicalHash = await sha256Hex(stableJson(parsed));
  const snapshot = {
    ...snapshotBase,
    canonical_hash: canonicalHash,
    metadata: {
      ...snapshotBase.metadata,
      // A bounded window is intentionally not a complete historical listing.
      // Never convert filtered history into destructive removal reviews.
      authoritative_listing:
        source.authoritativeListing &&
        windowed.filteredCount === 0 &&
        direct.droppedLandingPages === 0 &&
        direct.unavailableLandingPages === 0,
      window_mode: windowed.mode,
      bootstrap_attempt_floor: windowed.attemptFloor,
      published_floor: windowed.publishedFloor,
      filtered_item_count: windowed.filteredCount,
      resolved_study_material_pages: direct.resolvedLandingPages,
      dropped_study_material_pages: direct.droppedLandingPages,
      unavailable_study_material_pages: direct.unavailableLandingPages,
      parsed_item_count_after_window: parsedItemCount,
    },
  };
  if (source.lastContentHash && source.lastContentHash === canonicalHash) {
    await stage("writing");
    const { error } = await client.rpc("icai_sync_record_unchanged", {
      p_run_id: runId,
      p_source_id: source.id,
      p_snapshot: snapshot as Json,
    });
    if (error) throw error;
    return;
  }
  const attemptIdsByIdentity = new Map<string, string>();
  const attemptRowsByIdentity = new Map<string, AttemptRow>();
  for (const attempt of attempts) {
    const levelCode = levelById.get(attempt.level_id)?.code as
      IcaiLevelCode | undefined;
    if (levelCode) {
      const identity = `${levelCode}:${attempt.attempt_key}`;
      attemptIdsByIdentity.set(identity, attempt.id);
      attemptRowsByIdentity.set(identity, attempt);
    }
  }
  const attemptPayloads: Record<string, unknown>[] = [];
  for (const parsedAttempt of parsed.attempts) {
    for (const levelCode of parsedAttempt.levelCodes) {
      const level = levels.find((row) => row.code === levelCode);
      if (!level) continue;
      const identity = `${levelCode}:${parsedAttempt.attemptKey}`;
      const existingAttempt = attemptRowsByIdentity.get(identity);
      const id =
        attemptIdsByIdentity.get(identity) ??
        attemptId(levelCode, parsedAttempt.attemptKey);
      attemptIdsByIdentity.set(identity, id);
      const startDate = parsedAttempt.startDate??existingAttempt?.start_date??"";
      const endDate = parsedAttempt.endDate??existingAttempt?.end_date??"";
      const canonical = {
        attemptKey: parsedAttempt.attemptKey,
        levelCode,
        label: parsedAttempt.label,
        startDate,
        endDate,
      };
      attemptPayloads.push({
        id,
        level_id: level.id,
        attempt_key: parsedAttempt.attemptKey,
        label: parsedAttempt.label,
        start_date: startDate,
        end_date: endDate,
        status: "scheduled",
        source_url: source.officialUrl,
        content_hash: await sha256Hex(stableJson(canonical)),
        confidence: parsedAttempt.confidence,
        metadata: { source_page: source.officialUrl },
      });
    }
  }
  const { existingByUrl, existingBySemantic } =
    await existingResourceIdentityMaps(runtime, source);
  const resourcePayloads = await Promise.all(
    parsed.resources.map((resource) =>
      resourcePayload(
        source,
        resource,
        attemptIdsByIdentity,
        existingByUrl,
        existingBySemantic,
      ),
    ),
  );
  const eventPayloads: Record<string, unknown>[] = [];
  for (const event of parsed.events) {
    const attemptIdValue = attemptIdsByIdentity.get(
      `${event.levelCode}:${event.attemptKey}`,
    );
    if (!attemptIdValue) continue;
    const canonical = {
      attemptId: attemptIdValue,
      eventType: event.eventType,
      date: event.eventDate,
      title: event.title,
      subjectId: event.subjectId,
    };
    eventPayloads.push({
      id: `exam-event-${(await sha256Hex(stableJson(canonical))).slice(0, 32)}`,
      attempt_id: attemptIdValue,
      event_type: event.eventType,
      title: event.title,
      event_date: event.eventDate,
      start_time: event.startTime ?? "",
      end_time: event.endTime ?? "",
      subject_id: event.subjectId ?? "",
      source_url: event.sourceUrl,
      content_hash: await sha256Hex(stableJson(canonical)),
      confidence: event.confidence,
      metadata: { detected_from: source.id },
    });
  }
  await stage("writing");
  const { error } = await client.rpc("icai_sync_apply_source_batch", {
    p_run_id: runId,
    p_source_id: source.id,
    p_snapshot: snapshot as Json,
    p_resources: resourcePayloads as Json,
    p_attempts: attemptPayloads as Json,
    p_events: eventPayloads as Json,
  });
  if (error) throw error;

  if (windowed.mode === "bootstrap") {
    const completedAt = new Date().toISOString();
    await runtime.db
      .prepare("UPDATE icai_sources SET adapter_config=?1,updated_at=?2 WHERE id=?3")
      .bind(JSON.stringify(completedAdapterConfig(source, completedAt)), completedAt, source.id)
      .run();
  }
}

async function acquireRun(
  runtime: IcaiSyncRuntime,
  trigger: "cron" | "manual" | "test",
  requestedBy: string | null,
  sourceIds: string[],
) {
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const details = JSON.stringify({
    engine: "phase8",
    execution: "internal_worker",
    persistence: "cloudflare-d1",
    source_ids: sourceIds,
  });
  const row = await runtime.db.prepare(`INSERT INTO icai_sync_runs(id,trigger_type,requested_by,parser_version,status,started_at,source_total,details) SELECT ?1,?2,?3,?4,'running',?5,?6,?7 WHERE NOT EXISTS (SELECT 1 FROM icai_sync_runs WHERE status IN ('queued','running')) RETURNING id`)
    .bind(
      id,
      trigger,
      requestedBy,
      PARSER_VERSION,
      startedAt,
      sourceIds.length,
      details,
    )
    .first<{ id: string }>();
  if (!row) throw new IcaiSyncAlreadyRunningError();
  return row.id;
}


export type IcaiSyncContinuationStart = {
  runId: string;
  sourceIds: string[];
};

export type IcaiSyncContinuationSourceResult = {
  runId: string;
  sourceId: string;
  status: "succeeded" | "failed" | "skipped" | "cancelled";
  requestIntervalSeconds: number;
  alreadyComplete: boolean;
};

function parseDetails(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  }
  return {};
}

async function ensureContinuationSourceStates(runtime: IcaiSyncRuntime, runId: string, sourceIds: string[]) {
  if (!sourceIds.length) return;
  await runtime.db.batch(sourceIds.map((sourceId, sourceIndex) =>
    runtime.db.prepare("INSERT OR IGNORE INTO icai_sync_source_states(run_id,source_id,source_index,status,attempts,updated_at) VALUES(?1,?2,?3,'pending',0,CURRENT_TIMESTAMP)")
      .bind(runId, sourceId, sourceIndex)
  ));
}

async function continuationSources(client: AdminClient) {
  const response = await client.from("icai_sources").select("*").eq("is_active", true).order("id");
  if (response.error) throw response.error;
  const sources = ((response.data ?? []) as SourceRow[]).map(sourceDto);
  if (!sources.length) throw new Error("No active ICAI sources are configured.");
  return sources;
}

export async function startIcaiSyncContinuationEngine(
  runtime: IcaiSyncRuntime,
  { trigger, requestedBy = null, orchestrationKey }: {
    trigger: "cron" | "manual" | "test";
    requestedBy?: string | null;
    orchestrationKey: string;
  },
): Promise<IcaiSyncContinuationStart> {
  if (!runtime.enabled) throw new Error("ICAI synchronization is disabled for this environment.");
  await recoverStaleRuns(runtime.db);
  const client = adminClient(runtime);
  const sources = await continuationSources(client);
  const sourceIds = sources.map((source) => source.id);

  const active = await runtime.db.prepare("SELECT id,details FROM icai_sync_runs WHERE status IN ('queued','running') ORDER BY started_at DESC LIMIT 1")
    .first<{ id: string; details: unknown }>();
  if (active) {
    const details = parseDetails(active.details);
    if (details.orchestration_key === orchestrationKey) {
      const storedSourceIds = stringArray(details.source_ids);
      const effectiveSourceIds = storedSourceIds.length ? storedSourceIds : sourceIds;
      await ensureContinuationSourceStates(runtime, active.id, effectiveSourceIds);
      return { runId: active.id, sourceIds: effectiveSourceIds };
    }
    throw new IcaiSyncAlreadyRunningError();
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const details = JSON.stringify({
    engine: "phase8",
    execution: "queue_continuation",
    persistence: "cloudflare-d1",
    orchestration_key: orchestrationKey,
    source_ids: sourceIds,
  });
  const inserted = await runtime.db.prepare("INSERT INTO icai_sync_runs(id,trigger_type,requested_by,parser_version,status,started_at,source_total,details) SELECT ?1,?2,?3,?4,'running',?5,?6,?7 WHERE NOT EXISTS (SELECT 1 FROM icai_sync_runs WHERE status IN ('queued','running')) RETURNING id")
    .bind(runId, trigger, requestedBy, PARSER_VERSION, startedAt, sourceIds.length, details)
    .first<{ id: string }>();
  if (!inserted) {
    const retryActive = await runtime.db.prepare("SELECT id,details FROM icai_sync_runs WHERE status IN ('queued','running') ORDER BY started_at DESC LIMIT 1")
      .first<{ id: string; details: unknown }>();
    const retryDetails = parseDetails(retryActive?.details);
    if (retryActive && retryDetails.orchestration_key === orchestrationKey) {
      const storedSourceIds = stringArray(retryDetails.source_ids);
      const effectiveSourceIds = storedSourceIds.length ? storedSourceIds : sourceIds;
      await ensureContinuationSourceStates(runtime, retryActive.id, effectiveSourceIds);
      return { runId: retryActive.id, sourceIds: effectiveSourceIds };
    }
    throw new IcaiSyncAlreadyRunningError();
  }
  await ensureContinuationSourceStates(runtime, runId, sourceIds);
  await initializeRuntime(runtime.db, runId);
  return { runId, sourceIds };
}

export async function runIcaiSyncContinuationSource(
  runtime: IcaiSyncRuntime,
  { runId, sourceId }: { runId: string; sourceId: string },
): Promise<IcaiSyncContinuationSourceResult> {
  if (!runtime.enabled) throw new Error("ICAI synchronization is disabled for this environment.");
  const client = adminClient(runtime);
  const [sourceResponse, levelResponse, subjectResponse, attemptResponse] = await Promise.all([
    client.from("icai_sources").select("*").eq("id", sourceId).eq("is_active", true).single(),
    client.from("course_levels").select("*").eq("is_active", true),
    client.from("subjects").select("*").eq("is_active", true),
    client.from("exam_attempts").select("*").eq("verification_status", "verified"),
  ]);
  const firstError = [sourceResponse.error, levelResponse.error, subjectResponse.error, attemptResponse.error].find(Boolean);
  if (firstError) throw firstError;
  if (!sourceResponse.data) throw new Error(`ICAI source ${sourceId} is not active or does not exist.`);
  const source = sourceDto(sourceResponse.data as SourceRow);
  const state = await runtime.db.prepare("SELECT status FROM icai_sync_source_states WHERE run_id=?1 AND source_id=?2 LIMIT 1")
    .bind(runId, sourceId).first<{ status: string }>();
  if (!state) throw new Error(`ICAI continuation source state is missing for ${sourceId}.`);
  if (["succeeded", "failed", "skipped", "cancelled"].includes(state.status)) {
    return {
      runId,
      sourceId,
      status: state.status as IcaiSyncContinuationSourceResult["status"],
      requestIntervalSeconds: source.requestIntervalSeconds,
      alreadyComplete: true,
    };
  }
  const run = await runtime.db.prepare("SELECT status FROM icai_sync_runs WHERE id=?1 LIMIT 1").bind(runId).first<{ status: string }>();
  if (!run) throw new Error(`ICAI sync run ${runId} does not exist.`);
  if (run.status === "cancelled") {
    await runtime.db.prepare("UPDATE icai_sync_source_states SET status='cancelled',finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE run_id=?1 AND source_id=?2").bind(runId, sourceId).run();
    return { runId, sourceId, status: "cancelled", requestIntervalSeconds: source.requestIntervalSeconds, alreadyComplete: false };
  }
  if (run.status !== "running") throw new Error(`ICAI sync run ${runId} is not running (status=${run.status}).`);
  await runtime.db.prepare("UPDATE icai_sync_source_states SET status='running',attempts=attempts+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=?1 AND source_id=?2")
    .bind(runId, sourceId).run();
  try {
    await processSource(
      client,
      runtime,
      runId,
      source,
      (levelResponse.data ?? []) as LevelRow[],
      (subjectResponse.data ?? []) as SubjectRow[],
      (attemptResponse.data ?? []) as AttemptRow[],
    );
    await runtime.db.prepare("UPDATE icai_sync_source_states SET status='succeeded',finished_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=?1 AND source_id=?2")
      .bind(runId, sourceId).run();
    return { runId, sourceId, status: "succeeded", requestIntervalSeconds: source.requestIntervalSeconds, alreadyComplete: false };
  } catch (error) {
    if (error instanceof SyncCancelledError) {
      const message = asErrorMessage(error).slice(0, 2000);
      await runtime.db.batch([
        runtime.db.prepare("UPDATE icai_sync_runs SET status='cancelled',completed_at=CURRENT_TIMESTAMP,error_summary=?1 WHERE id=?2").bind(message, runId),
        runtime.db.prepare("UPDATE icai_sync_source_states SET status='cancelled',finished_at=CURRENT_TIMESTAMP,last_error=?1,updated_at=CURRENT_TIMESTAMP WHERE run_id=?2 AND source_id=?3").bind(message, runId, sourceId),
      ]);
      await setStage(runtime.db, runId, "cancelled");
      return { runId, sourceId, status: "cancelled", requestIntervalSeconds: source.requestIntervalSeconds, alreadyComplete: false };
    }
    const skipped = error instanceof SyncSourceSkippedError;
    const message = skipped
      ? "Skipped by an administrator. Last verified data was preserved."
      : asErrorMessage(error);
    const { error: failureError } = await client.rpc("icai_sync_mark_source_failure", {
      p_run_id: runId,
      p_source_id: source.id,
      p_error: message,
    });
    if (failureError) throw failureError;
    await runtime.db.prepare("UPDATE icai_sync_source_states SET status=?1,finished_at=CURRENT_TIMESTAMP,last_error=?2,updated_at=CURRENT_TIMESTAMP WHERE run_id=?3 AND source_id=?4")
      .bind(skipped ? "skipped" : "failed", message.slice(0, 2000), runId, sourceId).run();
    return { runId, sourceId, status: skipped ? "skipped" : "failed", requestIntervalSeconds: source.requestIntervalSeconds, alreadyComplete: false };
  }
}

function summaryFromRun(runId: string, result: RunRow, status: IcaiSyncSummary["status"]): IcaiSyncSummary {
  return {
    runId,
    status,
    sourceTotal: Number(result.source_total),
    sourceSucceeded: Number(result.source_succeeded),
    sourceFailed: Number(result.source_failed),
    newItems: Number(result.new_items),
    changedItems: Number(result.changed_items),
    unchangedItems: Number(result.unchanged_items),
    removedItems: Number(result.removed_items),
    pendingReviews: Number(result.pending_reviews),
  };
}

export async function finalizeIcaiSyncContinuationEngine(
  runtime: IcaiSyncRuntime,
  { runId }: { runId: string },
): Promise<IcaiSyncSummary> {
  const client = adminClient(runtime);
  const incomplete = await runtime.db.prepare("SELECT COUNT(*) AS count FROM icai_sync_source_states WHERE run_id=?1 AND status IN ('pending','running')")
    .bind(runId).first<{ count: number }>();
  if (Number(incomplete?.count ?? 0) > 0) throw new Error("ICAI continuation cannot finalize while source work is still pending.");
  const { data: finalRun, error: finalReadError } = await client.from("icai_sync_runs").select("*").eq("id", runId).single();
  if (finalReadError || !finalRun) throw finalReadError ?? new Error("Could not finalize ICAI sync run.");
  const row = finalRun as unknown as RunRow & { status?: string };
  if (row.status === "success" || row.status === "partial" || row.status === "failed") {
    return summaryFromRun(runId, row, row.status);
  }
  if (row.status === "cancelled") throw new SyncCancelledError();
  await setStage(runtime.db, runId, "finalizing");
  await checkpoint(runtime.db, runId);
  const status: IcaiSyncSummary["status"] = row.source_failed === 0
    ? "success"
    : row.source_succeeded > 0
      ? "partial"
      : "failed";
  const { error: finishError } = await client.from("icai_sync_runs")
    .update({ status, completed_at: new Date().toISOString() }).eq("id", runId);
  if (finishError) throw finishError;
  await setStage(runtime.db, runId, status === "success" ? "completed" : status);
  return summaryFromRun(runId, row, status);
}

export async function runIcaiSyncEngine(
  runtime: IcaiSyncRuntime,
  {
    trigger,
    requestedBy = null,
  }: { trigger: "cron" | "manual" | "test"; requestedBy?: string | null },
): Promise<IcaiSyncSummary> {
  if (!runtime.enabled)
    throw new Error("ICAI synchronization is disabled for this environment.");
  await recoverStaleRuns(runtime.db);
  const client = adminClient(runtime);
  const [sourceResponse, levelResponse, subjectResponse, attemptResponse] =
    await Promise.all([
      client.from("icai_sources").select("*").eq("is_active", true).order("id"),
      client.from("course_levels").select("*").eq("is_active", true),
      client.from("subjects").select("*").eq("is_active", true),
      client
        .from("exam_attempts")
        .select("*")
        .eq("verification_status", "verified"),
    ]);
  const firstError = [
    sourceResponse.error,
    levelResponse.error,
    subjectResponse.error,
    attemptResponse.error,
  ].find(Boolean);
  if (firstError) throw firstError;
  const sources = ((sourceResponse.data ?? []) as SourceRow[]).map(sourceDto);
  if (!sources.length)
    throw new Error("No active ICAI sources are configured.");
  const runId = await acquireRun(
    runtime,
    trigger,
    requestedBy,
    sources.map((source) => source.id),
  );
  await initializeRuntime(runtime.db, runId);
  try {
    for (const [index, source] of sources.entries()) {
      try {
        await processSource(
          client,
          runtime,
          runId,
          source,
          (levelResponse.data ?? []) as LevelRow[],
          (subjectResponse.data ?? []) as SubjectRow[],
          (attemptResponse.data ?? []) as AttemptRow[],
        );
      } catch (error) {
        if (error instanceof SyncCancelledError) throw error;
        const errorMessage = asErrorMessage(error);
        const { error: failureError } = await client.rpc(
          "icai_sync_mark_source_failure",
          {
            p_run_id: runId,
            p_source_id: source.id,
            p_error:
              error instanceof SyncSourceSkippedError
                ? "Skipped by an administrator. Last verified data was preserved."
                : errorMessage,
          },
        );
        if (failureError) throw failureError;
      }
      if (index < sources.length - 1 && source.requestIntervalSeconds > 0) {
        await setStage(runtime.db, runId, "selecting_sources");
        await checkpoint(runtime.db, runId);
        await sleep(source.requestIntervalSeconds * 1_000);
      }
    }
    await setStage(runtime.db, runId, "finalizing");
    await checkpoint(runtime.db, runId);
    const { data: finalRun, error: finalReadError } = await client
      .from("icai_sync_runs")
      .select("*")
      .eq("id", runId)
      .single();
    if (finalReadError || !finalRun)
      throw finalReadError ?? new Error("Could not finalize ICAI sync run.");
    const result = finalRun as unknown as RunRow;
    const status: IcaiSyncSummary["status"] =
      result.source_failed === 0
        ? "success"
        : result.source_succeeded > 0
          ? "partial"
          : "failed";
    const { error: finishError } = await client
      .from("icai_sync_runs")
      .update({ status, completed_at: new Date().toISOString() })
      .eq("id", runId);
    if (finishError) throw finishError;
    await setStage(runtime.db, runId, status === "success" ? "completed" : status);
    return {
      runId,
      status,
      sourceTotal: Number(result.source_total),
      sourceSucceeded: Number(result.source_succeeded),
      sourceFailed: Number(result.source_failed),
      newItems: Number(result.new_items),
      changedItems: Number(result.changed_items),
      unchangedItems: Number(result.unchanged_items),
      removedItems: Number(result.removed_items),
      pendingReviews: Number(result.pending_reviews),
    };
  } catch (error) {
    const errorMessage = asErrorMessage(error);
    const cancelled = error instanceof SyncCancelledError;
    await client
      .from("icai_sync_runs")
      .update({
        status: cancelled ? "cancelled" : "failed",
        completed_at: new Date().toISOString(),
        error_summary: errorMessage.slice(0, 4_000),
      })
      .eq("id", runId);
    await setStage(runtime.db, runId, cancelled ? "cancelled" : "failed");
    throw error;
  }
}
