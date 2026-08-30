import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getIcaiSyncConfig } from "@/lib/env";
import { parseOfficialSource } from "./adapters";
import { sha256Hex, stableJson } from "./hash";
import { isApprovedIcaiUrl } from "./html";
import type { IcaiLevelCode, IcaiSourceConfig, IcaiSyncSummary, ParsedIcaiResource } from "./types";

const PARSER_VERSION = "phase8.1";
const MAX_HTML_BYTES = 2_500_000;

type SourceRow = Database["public"]["Tables"]["icai_sources"]["Row"];
type LevelRow = Database["public"]["Tables"]["course_levels"]["Row"];
type SubjectRow = Database["public"]["Tables"]["subjects"]["Row"];
type AttemptRow = Database["public"]["Tables"]["exam_attempts"]["Row"];

function jsonObject(value: Json): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourceDto(row: SourceRow): IcaiSourceConfig {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    officialUrl: row.official_url,
    adapterKey: row.adapter_key as IcaiSourceConfig["adapterKey"],
    adapterConfig: jsonObject(row.adapter_config),
    levelCodes: row.level_codes as IcaiLevelCode[],
    resourceTypes: row.resource_types as IcaiSourceConfig["resourceTypes"],
    trustLevel: row.trust_level as IcaiSourceConfig["trustLevel"],
    authoritativeListing: row.authoritative_listing,
    parserVersion: row.parser_version,
    timeoutMs: row.timeout_ms,
    requestIntervalSeconds: row.request_interval_seconds,
    lastContentHash: row.last_content_hash,
    etag: row.etag,
    lastModified: row.last_modified,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number) {
  return Math.min(8_000, 600 * (2 ** attempt)) + Math.floor(Math.random() * 250);
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchOfficialPage(source: IcaiSourceConfig) {
  if (!isApprovedIcaiUrl(source.officialUrl)) throw new Error(`Rejected non-ICAI source URL for ${source.id}.`);
  const config = getIcaiSyncConfig();
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), source.timeoutMs);
    try {
      const headers = new Headers({ Accept: "text/html,application/xhtml+xml", "User-Agent": config.userAgent });
      if (source.etag) headers.set("If-None-Match", source.etag);
      if (source.lastModified) headers.set("If-Modified-Since", source.lastModified);

      const response = await fetch(source.officialUrl, {
        method: "GET",
        headers,
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
      });

      if (response.status === 304) return { response, html: "", bytes: 0, notModified: true };
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        if (attempt < 2 && Number.isFinite(retryAfter) && retryAfter > 0) await sleep(Math.min(retryAfter * 1_000, 15_000));
        throw new Error(`ICAI source returned ${response.status}`);
      }
      if (!response.ok) throw new Error(`ICAI source returned ${response.status}`);

      const contentType = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error(`Unexpected source content type: ${contentType || "unknown"}`);

      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) throw new Error("Official source page exceeded the Phase 8 HTML safety limit.");

      const html = await response.text();
      const bytes = new TextEncoder().encode(html).byteLength;
      if (bytes > MAX_HTML_BYTES) throw new Error("Official source page exceeded the Phase 8 HTML safety limit.");
      return { response, html, bytes, notModified: false };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(retryDelay(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Official ICAI source could not be fetched.");
}

function attemptId(levelCode: IcaiLevelCode, attemptKey: string) {
  return `attempt-${levelCode}-${attemptKey}`;
}

function subjectLevelCode(subject: SubjectRow, levels: Map<string, LevelRow>) {
  return levels.get(subject.level_id)?.code as IcaiLevelCode | undefined;
}

async function resourcePayload(source: IcaiSourceConfig, item: ParsedIcaiResource, attemptIdsByIdentity: Map<string, string>) {
  const id = `icai-resource-${(await sha256Hex(`${source.id}:${item.officialUrl}`)).slice(0, 32)}`;
  const attemptIds = item.attemptKeys
    .flatMap((key) => item.levelCodes.map((level) => attemptIdsByIdentity.get(`${level}:${key}`)))
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

async function processSource(runId: string, source: IcaiSourceConfig, levels: LevelRow[], subjects: SubjectRow[], attempts: AttemptRow[]) {
  const supabase = createAdminSupabaseClient();
  const fetched = await fetchOfficialPage(source);
  const snapshotBase = {
    http_status: fetched.response.status,
    content_length: fetched.bytes,
    etag: fetched.response.headers.get("etag"),
    last_modified: fetched.response.headers.get("last-modified"),
    parser_version: PARSER_VERSION,
    metadata: { authoritative_listing: source.authoritativeListing, source_type: source.sourceType },
  };

  if (fetched.notModified) {
    const { error } = await supabase.rpc("icai_sync_record_unchanged", {
      p_run_id: runId,
      p_source_id: source.id,
      p_snapshot: { ...snapshotBase, canonical_hash: source.lastContentHash ?? `etag:${source.etag ?? source.id}` } as Json,
    });
    if (error) throw error;
    return;
  }

  const levelById = new Map(levels.map((level) => [level.id, level]));
  const subjectLookups = subjects.flatMap((subject) => {
    const levelCode = subjectLevelCode(subject, levelById);
    return levelCode ? [{ id: subject.id, title: subject.title, levelCode }] : [];
  });
  const parsed = parseOfficialSource(fetched.html, source, subjectLookups);
  const parsedItemCount = parsed.resources.length + parsed.attempts.length + parsed.events.length;
  const allowEmpty = source.adapterConfig.allow_empty === true;
  if (parsedItemCount === 0 && !allowEmpty) throw new Error("Parser returned zero academic items. Last verified data was preserved for review.");

  const canonicalHash = await sha256Hex(stableJson(parsed));
  const snapshot = { ...snapshotBase, canonical_hash: canonicalHash };
  if (source.lastContentHash && source.lastContentHash === canonicalHash) {
    const { error } = await supabase.rpc("icai_sync_record_unchanged", {
      p_run_id: runId,
      p_source_id: source.id,
      p_snapshot: snapshot as Json,
    });
    if (error) throw error;
    return;
  }

  const attemptIdsByIdentity = new Map<string, string>();
  for (const attempt of attempts) {
    const levelCode = levelById.get(attempt.level_id)?.code as IcaiLevelCode | undefined;
    if (levelCode) attemptIdsByIdentity.set(`${levelCode}:${attempt.attempt_key}`, attempt.id);
  }

  const attemptPayloads: Record<string, unknown>[] = [];
  for (const parsedAttempt of parsed.attempts) {
    for (const levelCode of parsedAttempt.levelCodes) {
      const level = levels.find((row) => row.code === levelCode);
      if (!level) continue;
      const identity = `${levelCode}:${parsedAttempt.attemptKey}`;
      const id = attemptIdsByIdentity.get(identity) ?? attemptId(levelCode, parsedAttempt.attemptKey);
      attemptIdsByIdentity.set(identity, id);
      const canonical = {
        attemptKey: parsedAttempt.attemptKey,
        levelCode,
        label: parsedAttempt.label,
        startDate: parsedAttempt.startDate,
        endDate: parsedAttempt.endDate,
      };
      attemptPayloads.push({
        id,
        level_id: level.id,
        attempt_key: parsedAttempt.attemptKey,
        label: parsedAttempt.label,
        start_date: parsedAttempt.startDate ?? "",
        end_date: parsedAttempt.endDate ?? "",
        status: "scheduled",
        source_url: source.officialUrl,
        content_hash: await sha256Hex(stableJson(canonical)),
        confidence: parsedAttempt.confidence,
        metadata: { source_page: source.officialUrl },
      });
    }
  }

  const resourcePayloads = await Promise.all(parsed.resources.map((resource) => resourcePayload(source, resource, attemptIdsByIdentity)));
  const eventPayloads: Record<string, unknown>[] = [];
  for (const event of parsed.events) {
    const attemptIdValue = attemptIdsByIdentity.get(`${event.levelCode}:${event.attemptKey}`);
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

  const { error } = await supabase.rpc("icai_sync_apply_source_batch", {
    p_run_id: runId,
    p_source_id: source.id,
    p_snapshot: snapshot as Json,
    p_resources: resourcePayloads as Json,
    p_attempts: attemptPayloads as Json,
    p_events: eventPayloads as Json,
  });
  if (error) throw error;
}

export async function runIcaiSync({
  trigger,
  requestedBy = null,
}: {
  trigger: "cron" | "manual" | "test";
  requestedBy?: string | null;
}): Promise<IcaiSyncSummary> {
  const config = getIcaiSyncConfig();
  if (!config.enabled) throw new Error("ICAI synchronization is disabled for this environment.");

  const supabase = createAdminSupabaseClient();
  const [sourceResponse, levelResponse, subjectResponse, attemptResponse] = await Promise.all([
    supabase.from("icai_sources").select("*").eq("is_active", true).order("id"),
    supabase.from("course_levels").select("*").eq("is_active", true),
    supabase.from("subjects").select("*").eq("is_active", true),
    supabase.from("exam_attempts").select("*").eq("verification_status", "verified"),
  ]);
  const firstError = [sourceResponse.error, levelResponse.error, subjectResponse.error, attemptResponse.error].find(Boolean);
  if (firstError) throw firstError;

  const sources = (sourceResponse.data ?? []).map(sourceDto);
  if (!sources.length) throw new Error("No active ICAI sources are configured.");

  const { data: run, error: runError } = await supabase
    .from("icai_sync_runs")
    .insert({
      trigger_type: trigger,
      requested_by: requestedBy,
      status: "running",
      parser_version: PARSER_VERSION,
      source_total: sources.length,
      details: { engine: "phase8", source_ids: sources.map((source) => source.id) },
    })
    .select("id")
    .single();

  if (runError || !run) {
    if (runError?.code === "23505") throw new Error("An ICAI synchronization run is already in progress.");
    throw runError ?? new Error("Could not create the ICAI synchronization run.");
  }

  try {
    for (const [index, source] of sources.entries()) {
      try {
        await processSource(run.id, source, levelResponse.data ?? [], subjectResponse.data ?? [], attemptResponse.data ?? []);
      } catch (error) {
        const message = asErrorMessage(error);
        const { error: failureError } = await supabase.rpc("icai_sync_mark_source_failure", {
          p_run_id: run.id,
          p_source_id: source.id,
          p_error: message,
        });
        if (failureError) throw failureError;
      }
      if (index < sources.length - 1 && source.requestIntervalSeconds > 0) await sleep(source.requestIntervalSeconds * 1_000);
    }

    const { data: finalRun, error: finalReadError } = await supabase.from("icai_sync_runs").select("*").eq("id", run.id).single();
    if (finalReadError || !finalRun) throw finalReadError ?? new Error("Could not finalize ICAI sync run.");

    const status: IcaiSyncSummary["status"] = finalRun.source_failed === 0
      ? "success"
      : finalRun.source_succeeded > 0
        ? "partial"
        : "failed";

    const { error: finishError } = await supabase
      .from("icai_sync_runs")
      .update({ status, completed_at: new Date().toISOString() })
      .eq("id", run.id);
    if (finishError) throw finishError;

    return {
      runId: run.id,
      status,
      sourceTotal: finalRun.source_total,
      sourceSucceeded: finalRun.source_succeeded,
      sourceFailed: finalRun.source_failed,
      newItems: finalRun.new_items,
      changedItems: finalRun.changed_items,
      unchangedItems: finalRun.unchanged_items,
      removedItems: finalRun.removed_items,
      pendingReviews: finalRun.pending_reviews,
    };
  } catch (error) {
    const message = asErrorMessage(error);
    await supabase
      .from("icai_sync_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_summary: message.slice(0, 4_000) })
      .eq("id", run.id);
    throw error;
  }
}
