import { parseOfficialSource } from "../../lib/icai/adapters";
import { sha256Hex } from "../../lib/icai/hash";
import { extractOfficialLinks, isApprovedIcaiUrl } from "../../lib/icai/html";
import type {
  IcaiSourceConfig,
  ParsedExamAttempt,
  ParsedExamEvent,
  ParsedIcaiResource,
  ParsedSourcePayload,
} from "../../lib/icai/types";
import type { D1Database } from "./d1-client";
import {
  checkpoint,
  setStage,
  SyncItemSkippedError,
  SyncRemainingItemsSkippedError,
} from "./runtime-control";

const ITEM_TIMEOUT_MS = 30_000;
const MAX_ITEM_HTML_BYTES = 512_000;
const MAX_ITEM_REDIRECTS = 5;
const ITEM_REDIRECTS = new Set([301, 302, 303, 307, 308]);
const GENERIC_NAV =
  /^(home|about|contact|students?|members?|login|search|read more|click here|view all|next|previous|committees?|departments?)$/i;
const ACADEMIC_SIGNAL =
  /\b(exam|examination|rtp|revision test|mtp|mock test|model test|study material|statutory|amendment|question paper|suggested answer|date sheet|schedule|announcement|notification|corrigendum|addendum)\b/i;
const RESOURCE_HUB_SIGNAL =
  /\b(paper\s*[-:]?\s*\d+|section\s+[a-z]|foundation course|intermediate course|final course|model test papers?)\b/i;

type SubjectLookup = {
  id: string;
  title: string;
  levelCode: "foundation" | "intermediate" | "final";
};
type Candidate = { title: string; url: string };
type RetryMode = "failed" | "timed_out" | "item";

type ItemExecution = {
  id: string;
  startedAt: string;
};

type FetchedItem = {
  finalUrl: string;
  html: string | null;
  httpStatus: number;
  bytesFetched: number;
  notModified: boolean;
  etag: string | null;
  lastModified: string | null;
  contentHash: string | null;
};

type ItemState = {
  etag: string | null;
  last_modified: string | null;
  content_hash: string | null;
  consecutive_failures: number;
  next_retry_at: string | null;
};

export type RetrySelection = {
  originRunId: string;
  mode: RetryMode;
  urlsBySource: Map<string, Set<string>>;
};

export type IsolatedItemResult = {
  parsed: ParsedSourcePayload;
  terminalCount: number;
  successfulCount: number;
  failedCount: number;
  skippedCount: number;
  unchangedCount: number;
  deferredCount: number;
  failures: string[];
};

class ItemTimeoutError extends Error {
  constructor() {
    super("Item parser exceeded the 30-second isolation limit.");
    this.name = "ItemTimeoutError";
  }
}

class ItemHttpError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "ItemHttpError";
  }
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

function isAcademicCandidate(link: Candidate, source: IcaiSourceConfig) {
  const title = link.title.trim();
  if (GENERIC_NAV.test(title) || link.url === source.officialUrl) return false;
  let parsed: URL;
  try {
    parsed = new URL(link.url);
  } catch {
    return false;
  }
  const isDocument =
    /\.(pdf|docx?|xlsx?|zip)$/i.test(parsed.pathname) ||
    parsed.hostname.toLowerCase().startsWith("resource.cdn.");
  if (source.adapterKey === "resource_hub") {
    return (
      isDocument ||
      ACADEMIC_SIGNAL.test(`${title} ${link.url}`) ||
      (parsed.pathname.includes("/post/") && RESOURCE_HUB_SIGNAL.test(title))
    );
  }
  return (
    parsed.pathname.includes("/post/") ||
    isDocument ||
    ACADEMIC_SIGNAL.test(title)
  );
}

export function extractAcademicItemCandidates(
  html: string,
  source: IcaiSourceConfig,
) {
  return extractOfficialLinks(html, source.officialUrl).filter((link) =>
    isAcademicCandidate(link, source),
  );
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function singleLinkHtml(candidate: Candidate) {
  return `<a href="${escapeAttribute(candidate.url)}">${escapeText(candidate.title)}</a>`;
}

function parsedCount(parsed: ParsedSourcePayload) {
  return (
    parsed.resources.length + parsed.attempts.length + parsed.events.length
  );
}

function itemType(parsed: ParsedSourcePayload) {
  if (parsed.resources[0]?.resourceType)
    return parsed.resources[0].resourceType;
  if (parsed.events.length) return "exam_event";
  if (parsed.attempts.length) return "exam_attempt";
  return "academic_link";
}

async function readBoundedHtml(response: Response) {
  if (!response.body) return { html: "", bytes: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_ITEM_HTML_BYTES) {
        throw new Error("ICAI item HTML exceeded the 512 KB processing limit.");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { html: new TextDecoder().decode(merged), bytes };
}

async function fetchItem(
  candidate: Candidate,
  state: ItemState | null,
  force: boolean,
): Promise<FetchedItem> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ITEM_TIMEOUT_MS);
  let current = candidate.url;
  try {
    for (let hop = 0; hop <= MAX_ITEM_REDIRECTS; hop += 1) {
      if (!isApprovedHttpIcaiUrl(current))
        throw new Error("Rejected item redirect outside approved ICAI hosts.");
      const headers: Record<string, string> = {
        Accept:
          "text/html,application/xhtml+xml,application/pdf,application/octet-stream",
        Range: `bytes=0-${MAX_ITEM_HTML_BYTES - 1}`,
      };
      if (!force && state?.etag) headers["If-None-Match"] = state.etag;
      if (!force && state?.last_modified)
        headers["If-Modified-Since"] = state.last_modified;
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers,
      });
      if (ITEM_REDIRECTS.has(response.status)) {
        if (hop === MAX_ITEM_REDIRECTS)
          throw new Error("ICAI item exceeded the redirect limit.");
        const location = response.headers.get("location");
        if (!location) throw new Error("ICAI item redirect omitted Location.");
        await response.body?.cancel();
        current = new URL(location, current).toString();
        continue;
      }
      if (response.status === 304) {
        await response.body?.cancel();
        return {
          finalUrl: current,
          html: null,
          httpStatus: 304,
          bytesFetched: 0,
          notModified: true,
          etag: response.headers.get("etag") ?? state?.etag ?? null,
          lastModified:
            response.headers.get("last-modified") ??
            state?.last_modified ??
            null,
          contentHash: state?.content_hash ?? null,
        };
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ItemHttpError(
          `ICAI item returned HTTP ${response.status}.`,
          response.status,
        );
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        const body = await readBoundedHtml(response);
        return {
          finalUrl: current,
          html: body.html,
          httpStatus: response.status,
          bytesFetched: body.bytes,
          notModified: false,
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
          contentHash: await sha256Hex(body.html),
        };
      }
      await response.body?.cancel();
      return {
        finalUrl: current,
        html: null,
        httpStatus: response.status,
        bytesFetched: 0,
        notModified: false,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        contentHash: null,
      };
    }
    throw new Error("ICAI item redirect handling failed.");
  } catch (error) {
    if (controller.signal.aborted) throw new ItemTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadItemState(
  db: D1Database,
  sourceId: string,
  itemUrl: string,
) {
  return db
    .prepare(
      `SELECT etag,last_modified,content_hash,consecutive_failures,next_retry_at
    FROM icai_sync_item_state WHERE source_id=?1 AND item_url=?2`,
    )
    .bind(sourceId, itemUrl)
    .first<ItemState>();
}

async function saveItemSuccess(
  db: D1Database,
  sourceId: string,
  itemUrl: string,
  fetched: FetchedItem,
) {
  await db
    .prepare(
      `INSERT INTO icai_sync_item_state(source_id,item_url,etag,last_modified,content_hash,last_http_status,last_bytes_fetched,last_checked_at,last_success_at,consecutive_failures,next_retry_at,last_error,parser_version,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0,NULL,NULL,'phase8.1-item-isolation',CURRENT_TIMESTAMP)
    ON CONFLICT(source_id,item_url) DO UPDATE SET etag=COALESCE(excluded.etag,etag),last_modified=COALESCE(excluded.last_modified,last_modified),content_hash=COALESCE(excluded.content_hash,content_hash),last_http_status=excluded.last_http_status,last_bytes_fetched=excluded.last_bytes_fetched,last_checked_at=CURRENT_TIMESTAMP,last_success_at=CURRENT_TIMESTAMP,consecutive_failures=0,next_retry_at=NULL,last_error=NULL,parser_version=excluded.parser_version,updated_at=CURRENT_TIMESTAMP`,
    )
    .bind(
      sourceId,
      itemUrl,
      fetched.etag,
      fetched.lastModified,
      fetched.contentHash,
      fetched.httpStatus,
      fetched.bytesFetched,
    )
    .run();
}

async function saveItemFailure(
  db: D1Database,
  sourceId: string,
  itemUrl: string,
  state: ItemState | null,
  message: string,
) {
  const failures = Math.min(20, Number(state?.consecutive_failures ?? 0) + 1);
  const retryHours = Math.min(24, 2 ** failures);
  await db
    .prepare(
      `INSERT INTO icai_sync_item_state(source_id,item_url,consecutive_failures,next_retry_at,last_error,parser_version,updated_at)
    VALUES(?1,?2,?3,datetime('now',?4),?5,'phase8.1-item-isolation',CURRENT_TIMESTAMP)
    ON CONFLICT(source_id,item_url) DO UPDATE SET last_checked_at=CURRENT_TIMESTAMP,consecutive_failures=excluded.consecutive_failures,next_retry_at=excluded.next_retry_at,last_error=excluded.last_error,parser_version=excluded.parser_version,updated_at=CURRENT_TIMESTAMP`,
    )
    .bind(
      sourceId,
      itemUrl,
      failures,
      `+${retryHours} hours`,
      message.slice(0, 2000),
    )
    .run();
}

async function beginExecution(
  db: D1Database,
  runId: string,
  sourceId: string,
  candidate: Candidate,
): Promise<ItemExecution> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO icai_sync_items(
        id,run_id,source_id,item_url,item_type,item_title,status,stage,attempts,started_at,completed_at,
        duration_ms,bytes_fetched,parsed_count,failure_category,failure_message,skip_reason,retry_eligible,updated_at
      ) VALUES(?1,?2,?3,?4,'academic_link',?5,'running','parsing',1,?6,NULL,NULL,0,0,NULL,NULL,NULL,0,?6)
      ON CONFLICT(run_id,source_id,item_url) DO UPDATE SET
        item_title=excluded.item_title,status='running',stage='parsing',attempts=icai_sync_items.attempts+1,
        started_at=excluded.started_at,completed_at=NULL,duration_ms=NULL,failure_category=NULL,failure_message=NULL,
        skip_reason=NULL,retry_eligible=0,updated_at=excluded.updated_at
      RETURNING id,started_at`,
    )
    .bind(
      id,
      runId,
      sourceId,
      candidate.url,
      candidate.title.slice(0, 500),
      now,
    )
    .first<{ id: string; started_at: string }>();
  if (!row) throw new Error("Could not create ICAI item execution record.");
  return { id: row.id, startedAt: row.started_at };
}

async function finishExecution(
  db: D1Database,
  execution: ItemExecution,
  input: {
    status: "succeeded" | "failed" | "timed_out" | "skipped";
    stage: string;
    itemType?: string;
    parsedCount?: number;
    httpStatus?: number | null;
    bytesFetched?: number;
    failureCategory?: string | null;
    failureMessage?: string | null;
    skipReason?: string | null;
    retryEligible?: boolean;
  },
) {
  const completedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(completedAt).getTime() - new Date(execution.startedAt).getTime(),
  );
  await db
    .prepare(
      `UPDATE icai_sync_items SET
        status=?1,stage=?2,item_type=COALESCE(?3,item_type),completed_at=?4,duration_ms=?5,
        parsed_count=?6,http_status=?7,bytes_fetched=?8,failure_category=?9,failure_message=?10,skip_reason=?11,retry_eligible=?12,updated_at=?4
      WHERE id=?13`,
    )
    .bind(
      input.status,
      input.stage,
      input.itemType ?? null,
      completedAt,
      durationMs,
      input.parsedCount ?? 0,
      input.httpStatus ?? null,
      input.bytesFetched ?? 0,
      input.failureCategory ?? null,
      input.failureMessage?.slice(0, 2_000) ?? null,
      input.skipReason?.slice(0, 500) ?? null,
      input.retryEligible ? 1 : 0,
      execution.id,
    )
    .run();
}

async function activeExclusion(
  db: D1Database,
  runId: string,
  sourceId: string,
  itemUrl: string,
) {
  return db
    .prepare(
      `SELECT id,scope,reason,expires_at
       FROM icai_sync_item_exclusions
       WHERE source_id=?1 AND item_url=?2 AND revoked_at IS NULL
         AND (
           (scope='run' AND run_id=?3) OR
           scope='permanent' OR
           (scope='temporary' AND expires_at>CURRENT_TIMESTAMP)
         )
       ORDER BY CASE scope WHEN 'run' THEN 1 WHEN 'temporary' THEN 2 ELSE 3 END
       LIMIT 1`,
    )
    .bind(sourceId, itemUrl, runId)
    .first<{
      id: string;
      scope: string;
      reason: string;
      expires_at: string | null;
    }>();
}

function mergePayloads(payloads: ParsedSourcePayload[]): ParsedSourcePayload {
  const resources = new Map<string, ParsedIcaiResource>();
  const attempts = new Map<string, ParsedExamAttempt>();
  const events = new Map<string, ParsedExamEvent>();

  for (const payload of payloads) {
    for (const resource of payload.resources) {
      resources.set(resource.officialUrl, resource);
    }
    for (const attempt of payload.attempts) {
      const key = `${attempt.attemptKey}:${attempt.levelCodes.slice().sort().join(",")}`;
      attempts.set(key, attempt);
    }
    for (const event of payload.events) {
      const key = [
        event.sourceUrl,
        event.eventType,
        event.eventDate,
        event.subjectId ?? "",
      ].join(":");
      events.set(key, event);
    }
  }

  return {
    resources: [...resources.values()],
    attempts: [...attempts.values()],
    events: [...events.values()],
  };
}

function failureCategory(error: unknown) {
  if (error instanceof ItemTimeoutError) return "timeout";
  if (error instanceof ItemHttpError) return "http";
  if (error instanceof SyncItemSkippedError) return "admin_skip";
  if (error instanceof SyncRemainingItemsSkippedError)
    return "admin_skip_remaining";
  if (error instanceof TypeError) return "parser_validation";
  return "parser";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function processIsolatedSourceItems(
  db: D1Database,
  runId: string,
  source: IcaiSourceConfig,
  html: string,
  subjects: SubjectLookup[],
  allowedItemUrls: Set<string> | null = null,
): Promise<IsolatedItemResult> {
  const allCandidates = extractAcademicItemCandidates(html, source);
  const candidates = allowedItemUrls
    ? allCandidates.filter((candidate) => allowedItemUrls.has(candidate.url))
    : allCandidates;
  const payloads: ParsedSourcePayload[] = [];
  const failures: string[] = [];
  let failedCount = 0;
  let skippedCount = 0;
  let successfulCount = 0;
  let terminalCount = 0;
  let unchangedCount = 0;
  let deferredCount = 0;
  let skipRemaining = false;
  const seen = new Set<string>();

  for (const candidate of candidates) {
    seen.add(candidate.url);
    const execution = await beginExecution(db, runId, source.id, candidate);
    if (skipRemaining) {
      await finishExecution(db, execution, {
        status: "skipped",
        stage: "skipped",
        skipReason: "Remaining items were skipped by an administrator.",
        retryEligible: true,
      });
      skippedCount += 1;
      terminalCount += 1;
      continue;
    }

    const exclusion = await activeExclusion(
      db,
      runId,
      source.id,
      candidate.url,
    );
    if (exclusion) {
      await finishExecution(db, execution, {
        status: "skipped",
        stage: "excluded",
        skipReason: `${exclusion.scope} exclusion: ${exclusion.reason}`,
        retryEligible: exclusion.scope === "run",
      });
      skippedCount += 1;
      terminalCount += 1;
      continue;
    }

    const state = await loadItemState(db, source.id, candidate.url);
    if (
      !allowedItemUrls &&
      state?.next_retry_at &&
      new Date(state.next_retry_at).getTime() > Date.now()
    ) {
      await finishExecution(db, execution, {
        status: "skipped",
        stage: "retry_deferred",
        skipReason: `Automatic retry deferred until ${state.next_retry_at}.`,
        retryEligible: true,
      });
      deferredCount += 1;
      terminalCount += 1;
      continue;
    }

    try {
      await setStage(db, runId, "parsing", source.id, candidate.url);
      await checkpoint(db, runId, "item");
      const itemStartedAt = Date.now();
      const fetched = await fetchItem(
        candidate,
        state,
        Boolean(allowedItemUrls),
      );
      await setStage(db, runId, "parsing", source.id, fetched.finalUrl);
      if (
        fetched.notModified ||
        (!allowedItemUrls &&
          fetched.contentHash &&
          fetched.contentHash === state?.content_hash)
      ) {
        await saveItemSuccess(db, source.id, candidate.url, fetched);
        await finishExecution(db, execution, {
          status: "succeeded",
          stage: "unchanged",
          httpStatus: fetched.httpStatus,
          bytesFetched: fetched.bytesFetched,
          retryEligible: false,
        });
        unchangedCount += 1;
        successfulCount += 1;
        terminalCount += 1;
        continue;
      }
      const input = fetched.html ?? singleLinkHtml(candidate);
      const parsed = parseOfficialSource(
        input,
        { ...source, officialUrl: fetched.finalUrl },
        subjects,
      );
      if (Date.now() - itemStartedAt > ITEM_TIMEOUT_MS)
        throw new ItemTimeoutError();
      const count = parsedCount(parsed);
      if (count === 0) {
        await saveItemSuccess(db, source.id, candidate.url, fetched);
        await finishExecution(db, execution, {
          status: "skipped",
          stage: "not_academic",
          skipReason: "The candidate no longer classified as an academic item.",
          retryEligible: false,
        });
        skippedCount += 1;
        terminalCount += 1;
        continue;
      }
      payloads.push(parsed);
      await saveItemSuccess(db, source.id, candidate.url, fetched);
      await finishExecution(db, execution, {
        status: "succeeded",
        stage: "parsed",
        itemType: itemType(parsed),
        parsedCount: count,
        httpStatus: fetched.httpStatus,
        bytesFetched: fetched.bytesFetched,
        retryEligible: false,
      });
      successfulCount += 1;
      terminalCount += 1;
    } catch (error) {
      const category = failureCategory(error);
      if (error instanceof SyncRemainingItemsSkippedError) skipRemaining = true;
      if (
        error instanceof SyncItemSkippedError ||
        error instanceof SyncRemainingItemsSkippedError
      ) {
        await finishExecution(db, execution, {
          status: "skipped",
          stage: "skipped",
          failureCategory: category,
          skipReason: errorMessage(error),
          retryEligible: true,
        });
        skippedCount += 1;
      } else {
        const timedOut = error instanceof ItemTimeoutError;
        const message = errorMessage(error);
        await saveItemFailure(db, source.id, candidate.url, state, message);
        await finishExecution(db, execution, {
          status: timedOut ? "timed_out" : "failed",
          stage: timedOut ? "timed_out" : "failed",
          failureCategory: category,
          failureMessage: message,
          httpStatus: error instanceof ItemHttpError ? error.httpStatus : null,
          retryEligible: true,
        });
        failures.push(`${candidate.url}: ${message}`);
        failedCount += 1;
      }
      terminalCount += 1;
    }
  }

  if (allowedItemUrls) {
    for (const missingUrl of allowedItemUrls) {
      if (seen.has(missingUrl)) continue;
      const execution = await beginExecution(db, runId, source.id, {
        title: "Retry target",
        url: missingUrl,
      });
      const message =
        "Retry target is no longer present on the official source page.";
      await finishExecution(db, execution, {
        status: "failed",
        stage: "missing",
        failureCategory: "missing_on_retry",
        failureMessage: message,
        retryEligible: true,
      });
      failures.push(`${missingUrl}: ${message}`);
      failedCount += 1;
      terminalCount += 1;
    }
  }

  return {
    parsed: mergePayloads(payloads),
    terminalCount,
    successfulCount,
    failedCount,
    skippedCount,
    unchangedCount,
    deferredCount,
    failures,
  };
}

export async function loadRetrySelection(
  db: D1Database,
  originRunId: string,
  mode: RetryMode,
  itemId: string | null,
): Promise<RetrySelection> {
  const clauses = ["run_id=?1", "retry_eligible=1"];
  const values: unknown[] = [originRunId];
  if (mode === "timed_out") clauses.push("status='timed_out'");
  else clauses.push("status IN ('failed','timed_out','skipped')");
  if (mode === "item") {
    if (!itemId)
      throw new Error("A specific ICAI item is required for item retry.");
    values.push(itemId);
    clauses.push(`id=?${values.length}`);
  }
  const rows = await db
    .prepare(
      `SELECT source_id,item_url FROM icai_sync_items WHERE ${clauses.join(" AND ")} ORDER BY source_id,item_url`,
    )
    .bind(...values)
    .all<{ source_id: string; item_url: string }>();
  const urlsBySource = new Map<string, Set<string>>();
  for (const row of rows.results ?? []) {
    const urls = urlsBySource.get(row.source_id) ?? new Set<string>();
    urls.add(row.item_url);
    urlsBySource.set(row.source_id, urls);
  }
  if (!urlsBySource.size)
    throw new Error("No retry-eligible ICAI items matched this request.");
  return { originRunId, mode, urlsBySource };
}

export async function resolveSuccessfulRetryItems(
  db: D1Database,
  originRunId: string,
  retryRunId: string,
  sourceId: string,
) {
  await db
    .prepare(
      `UPDATE icai_sync_items
       SET retry_eligible=0,updated_at=CURRENT_TIMESTAMP
       WHERE run_id=?1 AND source_id=?2 AND retry_eligible=1
         AND item_url IN (
           SELECT item_url FROM icai_sync_items
           WHERE run_id=?3 AND source_id=?2 AND status='succeeded'
         )`,
    )
    .bind(originRunId, sourceId, retryRunId)
    .run();
}

export async function sourceIsPaused(db: D1Database, sourceId: string) {
  const row = await db
    .prepare(
      "SELECT paused_until FROM icai_source_controls WHERE source_id=?1 AND paused_until>CURRENT_TIMESTAMP",
    )
    .bind(sourceId)
    .first<{ paused_until: string }>();
  return Boolean(row);
}

export async function previousSourceItemCount(
  db: D1Database,
  sourceId: string,
) {
  const row = await db
    .prepare(
      "SELECT parsed_item_count FROM icai_source_snapshots WHERE source_id=?1 ORDER BY fetched_at DESC LIMIT 1",
    )
    .bind(sourceId)
    .first<{ parsed_item_count: number }>();
  return row ? Number(row.parsed_item_count) : null;
}
