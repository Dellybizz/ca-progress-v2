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
  loadRetrySelection,
  previousSourceItemCount,
  processIsolatedSourceItems,
  sourceIsPaused,
  type RetrySelection,
} from "./item-isolation";
import {
  checkpoint,
  initializeRuntime,
  recoverStaleRuns,
  setStage,
  SyncCancelledError,
  SyncSourceSkippedError,
} from "./runtime-control";

const PARSER_VERSION = "phase8.1-item-isolation";
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
  last_success_at: string | null;
};
type SourceRuntimeConfig = IcaiSourceConfig & { lastSuccessAt: string | null };
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
type RetryMode = "failed" | "timed_out" | "item";

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

function sourceDto(row: SourceRow): SourceRuntimeConfig {
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
    lastSuccessAt: row.last_success_at,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number) {
  return Math.min(8_000, 600 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
    const response = await fetch(current, { ...init, redirect: "manual" });
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
  { force = false }: { force?: boolean } = {},
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
      if (!force && source.etag) headers.set("If-None-Match", source.etag);
      if (!force && source.lastModified)
        headers.set("If-Modified-Since", source.lastModified);
      const response = await fetchFollowingApprovedRedirects(source.officialUrl, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: controller.signal,
      });
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

async function resourcePayload(
  source: IcaiSourceConfig,
  item: ParsedIcaiResource,
  attemptIdsByIdentity: Map<string, string>,
) {
  const id = `icai-resource-${(await sha256Hex(`${source.id}:${item.officialUrl}`)).slice(0, 32)}`;
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
    metadata: { level_codes: item.levelCodes, attempt_keys: item.attemptKeys },
  };
}

async function markSourcePartial(
  runtime: IcaiSyncRuntime,
  runId: string,
  source: SourceRuntimeConfig,
  message: string,
) {
  const now = new Date().toISOString();
  const run = await runtime.db
    .prepare("SELECT error_summary FROM icai_sync_runs WHERE id=?1")
    .bind(runId)
    .first<{ error_summary: string | null }>();
  const summary = (
    (run?.error_summary ? `${run.error_summary}\n` : "") +
    `${source.id}: ${message}`
  ).slice(0, 4_000);
  await runtime.db.batch([
    runtime.db
      .prepare(
        `UPDATE icai_sources SET
          last_success_at=?1,last_content_hash=?2,etag=?3,last_modified=?4,
          last_error_at=?5,last_error=?6,consecutive_failures=consecutive_failures+1,updated_at=?5
        WHERE id=?7`,
      )
      .bind(
        source.lastSuccessAt,
        source.lastContentHash,
        source.etag,
        source.lastModified,
        now,
        message.slice(0, 2_000),
        source.id,
      ),
    runtime.db
      .prepare(
        "UPDATE icai_sync_runs SET source_succeeded=MAX(source_succeeded-1,0),source_failed=source_failed+1,error_summary=?1 WHERE id=?2",
      )
      .bind(summary, runId),
  ]);
}

async function restoreTargetedRetrySourceState(
  runtime: IcaiSyncRuntime,
  source: SourceRuntimeConfig,
) {
  await runtime.db
    .prepare(
      "UPDATE icai_sources SET last_success_at=?1,last_content_hash=?2,etag=?3,last_modified=?4 WHERE id=?5",
    )
    .bind(
      source.lastSuccessAt,
      source.lastContentHash,
      source.etag,
      source.lastModified,
      source.id,
    )
    .run();
}

async function processSource(
  client: AdminClient,
  runtime: IcaiSyncRuntime,
  runId: string,
  source: SourceRuntimeConfig,
  levels: LevelRow[],
  subjects: SubjectRow[],
  attempts: AttemptRow[],
  allowedItemUrls: Set<string> | null,
) {
  const targetedRetry = Boolean(allowedItemUrls);
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
  const fetched = await fetchOfficialPage(source, runtime, {
    force: targetedRetry,
  });
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
      targeted_retry: targetedRetry,
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
  const isolated = await processIsolatedSourceItems(
    runtime.db,
    runId,
    source,
    fetched.html,
    subjectLookups,
    allowedItemUrls,
  );
  const parsed = isolated.parsed;
  const parsedItemCount =
    parsed.resources.length + parsed.attempts.length + parsed.events.length;
  const allowEmpty = source.adapterConfig.allow_empty === true;
  if (parsedItemCount === 0 && !allowEmpty)
    throw new Error(
      isolated.failures.length
        ? `No safe academic items were produced. ${isolated.failures[0]} Last verified data was preserved.`
        : "Parser returned zero academic items. Last verified data was preserved for review.",
    );

  if (!targetedRetry) {
    const previousCount = await previousSourceItemCount(runtime.db, source.id);
    if (
      previousCount !== null &&
      previousCount >= 10 &&
      parsedItemCount < Math.floor(previousCount * 0.5)
    ) {
      throw new Error(
        `Suspicious parser item-count drop (${previousCount} -> ${parsedItemCount}). Last verified data was preserved for manual review.`,
      );
    }
  }

  const incomplete = isolated.failedCount > 0 || isolated.skippedCount > 0;
  if (isolated.successfulCount === 0 && incomplete) {
    throw new Error(
      `All selected items failed or were skipped. Last verified data was preserved. ${isolated.failures[0] ?? ""}`.trim(),
    );
  }

  await stage("comparing");
  const canonicalHash = await sha256Hex(stableJson(parsed));
  const authoritativeListing =
    source.authoritativeListing && !incomplete && !targetedRetry;
  const snapshot = {
    ...snapshotBase,
    canonical_hash: canonicalHash,
    metadata: {
      ...snapshotBase.metadata,
      authoritative_listing: authoritativeListing,
      item_terminal_count: isolated.terminalCount,
      item_success_count: isolated.successfulCount,
      item_failed_count: isolated.failedCount,
      item_skipped_count: isolated.skippedCount,
    },
  };

  if (
    !incomplete &&
    !targetedRetry &&
    source.lastContentHash &&
    source.lastContentHash === canonicalHash
  ) {
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
      | IcaiLevelCode
      | undefined;
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
      const startDate =
        parsedAttempt.startDate ?? existingAttempt?.start_date ?? "";
      const endDate = parsedAttempt.endDate ?? existingAttempt?.end_date ?? "";
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

  const resourcePayloads: Record<string, unknown>[] = [];
  for (const resource of parsed.resources) {
    try {
      resourcePayloads.push(
        await resourcePayload(source, resource, attemptIdsByIdentity),
      );
    } catch (error) {
      await runtime.db
        .prepare(
          "UPDATE icai_sync_items SET status='failed',stage='payload',completed_at=CURRENT_TIMESTAMP,failure_category='payload',failure_message=?1,retry_eligible=1,updated_at=CURRENT_TIMESTAMP WHERE run_id=?2 AND source_id=?3 AND item_url=?4",
        )
        .bind(
          asErrorMessage(error).slice(0, 2_000),
          runId,
          source.id,
          resource.officialUrl,
        )
        .run();
      isolated.failedCount += 1;
      isolated.failures.push(`${resource.officialUrl}: ${asErrorMessage(error)}`);
    }
  }

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

  const unsafeAfterPayload = isolated.failedCount > 0 || isolated.skippedCount > 0;
  if (!resourcePayloads.length && !attemptPayloads.length && !eventPayloads.length) {
    throw new Error(
      `No safe payload remained after per-item validation. Last verified data was preserved. ${isolated.failures[0] ?? ""}`.trim(),
    );
  }

  await stage("writing");
  const safeSnapshot = {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      authoritative_listing:
        source.authoritativeListing && !unsafeAfterPayload && !targetedRetry,
    },
  };
  const { error } = await client.rpc("icai_sync_apply_source_batch", {
    p_run_id: runId,
    p_source_id: source.id,
    p_snapshot: safeSnapshot as Json,
    p_resources: resourcePayloads as Json,
    p_attempts: attemptPayloads as Json,
    p_events: eventPayloads as Json,
  });
  if (error) throw error;

  if (targetedRetry) {
    await restoreTargetedRetrySourceState(runtime, source);
  }
  if (unsafeAfterPayload) {
    await markSourcePartial(
      runtime,
      runId,
      source,
      `${isolated.failedCount} item(s) failed and ${isolated.skippedCount} item(s) were skipped; successful items were applied without authoritative removals. Last-known-good source validators were preserved.`,
    );
  }
}

async function acquireRun(
  runtime: IcaiSyncRuntime,
  trigger: "cron" | "manual" | "test",
  requestedBy: string | null,
  sourceIds: string[],
  retrySelection: RetrySelection | null,
) {
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const details = JSON.stringify({
    engine: "phase8-item-isolation",
    execution: "internal_worker",
    persistence: "cloudflare-d1",
    source_ids: sourceIds,
    retry_origin_run_id: retrySelection?.originRunId ?? null,
    retry_mode: retrySelection?.mode ?? null,
  });
  const row = await runtime.db
    .prepare(
      `INSERT INTO icai_sync_runs(id,trigger_type,requested_by,parser_version,status,started_at,source_total,details)
       SELECT ?1,?2,?3,?4,'running',?5,?6,?7
       WHERE NOT EXISTS (SELECT 1 FROM icai_sync_runs WHERE status IN ('queued','running'))
       RETURNING id`,
    )
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

export async function runIcaiSyncEngine(
  runtime: IcaiSyncRuntime,
  {
    trigger,
    requestedBy = null,
    retryRunId = null,
    retryMode = null,
    retryItemId = null,
  }: {
    trigger: "cron" | "manual" | "test";
    requestedBy?: string | null;
    retryRunId?: string | null;
    retryMode?: RetryMode | null;
    retryItemId?: string | null;
  },
): Promise<IcaiSyncSummary> {
  if (!runtime.enabled)
    throw new Error("ICAI synchronization is disabled for this environment.");
  await recoverStaleRuns(runtime.db);
  const client = adminClient(runtime);
  const retrySelection =
    retryRunId && retryMode
      ? await loadRetrySelection(runtime.db, retryRunId, retryMode, retryItemId)
      : null;

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

  const configuredSources = ((sourceResponse.data ?? []) as SourceRow[]).map(
    sourceDto,
  );
  const sources: SourceRuntimeConfig[] = [];
  for (const source of configuredSources) {
    if (retrySelection && !retrySelection.urlsBySource.has(source.id)) continue;
    if (await sourceIsPaused(runtime.db, source.id)) continue;
    sources.push(source);
  }
  if (!sources.length)
    throw new Error(
      retrySelection
        ? "No retry-eligible ICAI sources are currently available."
        : "No active ICAI sources are configured or all active sources are temporarily paused.",
    );

  const runId = await acquireRun(
    runtime,
    trigger,
    requestedBy,
    sources.map((source) => source.id),
    retrySelection,
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
          retrySelection?.urlsBySource.get(source.id) ?? null,
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
    await setStage(
      runtime.db,
      runId,
      status === "success" ? "completed" : status,
    );
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
