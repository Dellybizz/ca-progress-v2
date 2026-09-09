import "server-only";

import { createD1ServerClient } from "@/lib/data/d1/client";
import { createD1AdminClient } from "@/lib/data/d1/client";
import type { Database } from "@/lib/data/database.types";
import type {
  IcaiAdminDashboard,
  IcaiPublicCatalog,
  IcaiPublicFilters,
  IcaiResourceCard,
  IcaiResourceType,
} from "./types";
import { getSharedPublicJson } from "@/lib/cache/public";

type LevelRow = Database["public"]["Tables"]["course_levels"]["Row"];
type AttemptRow = Database["public"]["Tables"]["exam_attempts"]["Row"];
type ResourceRow = Database["public"]["Tables"]["icai_resources"]["Row"];
type SourceRow = Database["public"]["Tables"]["icai_sources"]["Row"];
type SubjectRow = Database["public"]["Tables"]["subjects"]["Row"];
type AttemptMapRow =
  Database["public"]["Tables"]["resource_attempt_map"]["Row"];
type SubjectMapRow =
  Database["public"]["Tables"]["resource_subject_map"]["Row"];
type EventRow = Database["public"]["Tables"]["exam_events"]["Row"];
type SyncRunRow = Database["public"]["Tables"]["icai_sync_runs"]["Row"];
type ReviewRow = Database["public"]["Tables"]["icai_review_queue"]["Row"];
type ChangeRow = Database["public"]["Tables"]["icai_change_events"]["Row"];

function cleanFilter(value: string | null | undefined) {
  const next = value?.trim() ?? "";
  if (!next || next === "all" || next.length > 120) return "";
  return next;
}

function dateSort(a: string | null, b: string | null) {
  return (b ?? "").localeCompare(a ?? "");
}

export async function getIcaiPublicCatalog(
  filters: IcaiPublicFilters = {},
): Promise<IcaiPublicCatalog> {
  const key = [
    "catalog-v1",
    filters.level,
    filters.attempt,
    filters.subject,
    filters.type,
  ]
    .map((value) => encodeURIComponent(value ?? ""))
    .join(":");
  return getSharedPublicJson({
    namespace: "icai",
    key,
    ttlSeconds: 300,
    load: async () => {
      const client = await createD1ServerClient();
      const [
        levelsResponse,
        attemptsResponse,
        resourcesResponse,
        sourcesResponse,
        subjectsResponse,
        attemptMapResponse,
        subjectMapResponse,
        eventsResponse,
      ] = await Promise.all([
        client
          .from("course_levels")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        client
          .from("exam_attempts")
          .select("*")
          .eq("verification_status", "verified")
          .order("attempt_key", { ascending: false }),
        client
          .from("icai_resources")
          .select("*")
          .eq("verification_status", "verified")
          .eq("status", "active")
          .order("last_seen_at", { ascending: false })
          .limit(500),
        client.from("icai_sources").select("*").eq("is_active", true),
        client
          .from("subjects")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        client.from("resource_attempt_map").select("*"),
        client.from("resource_subject_map").select("*"),
        client
          .from("exam_events")
          .select("*")
          .eq("verification_status", "verified")
          .order("event_date")
          .limit(150),
      ]);

      const firstError = [
        levelsResponse.error,
        attemptsResponse.error,
        resourcesResponse.error,
        sourcesResponse.error,
        subjectsResponse.error,
        attemptMapResponse.error,
        subjectMapResponse.error,
        eventsResponse.error,
      ].find(Boolean);
      if (firstError) throw firstError;

      const levels = (levelsResponse.data ?? []) as LevelRow[];
      const attempts = (attemptsResponse.data ?? []) as AttemptRow[];
      const resources = (resourcesResponse.data ?? []) as ResourceRow[];
      const sources = (sourcesResponse.data ?? []) as SourceRow[];
      const subjects = (subjectsResponse.data ?? []) as SubjectRow[];
      const attemptMaps = (attemptMapResponse.data ?? []) as AttemptMapRow[];
      const subjectMaps = (subjectMapResponse.data ?? []) as SubjectMapRow[];
      const events = (eventsResponse.data ?? []) as EventRow[];

      const selected = {
        level: cleanFilter(filters.level),
        attempt: cleanFilter(filters.attempt),
        subject: cleanFilter(filters.subject),
        type: cleanFilter(filters.type),
      };

      const levelById = new Map(levels.map((row: LevelRow) => [row.id, row]));
      const attemptById = new Map(
        attempts.map((row: AttemptRow) => [row.id, row]),
      );
      const sourceById = new Map(
        sources.map((row: SourceRow) => [row.id, row]),
      );
      const subjectById = new Map(
        subjects.map((row: SubjectRow) => [row.id, row]),
      );

      const attemptIdsByResource = new Map<string, string[]>();
      for (const row of attemptMaps as AttemptMapRow[]) {
        attemptIdsByResource.set(row.resource_id, [
          ...(attemptIdsByResource.get(row.resource_id) ?? []),
          row.attempt_id,
        ]);
      }
      const subjectIdsByResource = new Map<string, string[]>();
      for (const row of subjectMaps as SubjectMapRow[]) {
        subjectIdsByResource.set(row.resource_id, [
          ...(subjectIdsByResource.get(row.resource_id) ?? []),
          row.subject_id,
        ]);
      }

      const filtered = (resources as ResourceRow[]).filter((resource) => {
        if (selected.type && resource.resource_type !== selected.type)
          return false;
        const mappedAttemptIds = attemptIdsByResource.get(resource.id) ?? [];
        const mappedSubjectIds = subjectIdsByResource.get(resource.id) ?? [];
        if (
          selected.attempt &&
          !mappedAttemptIds.some(
            (id) => attemptById.get(id)?.attempt_key === selected.attempt,
          )
        )
          return false;
        if (selected.subject && !mappedSubjectIds.includes(selected.subject))
          return false;
        if (selected.level) {
          const metadata =
            resource.metadata &&
            typeof resource.metadata === "object" &&
            !Array.isArray(resource.metadata)
              ? (resource.metadata as Record<string, unknown>)
              : {};
          const levelsFromMetadata = Array.isArray(metadata.level_codes)
            ? metadata.level_codes.filter(
                (value): value is string => typeof value === "string",
              )
            : [];
          const mappedLevel =
            mappedAttemptIds.some(
              (id) =>
                levelById.get(attemptById.get(id)?.level_id ?? "")?.code ===
                selected.level,
            ) ||
            mappedSubjectIds.some(
              (id) =>
                levelById.get(subjectById.get(id)?.level_id ?? "")?.code ===
                selected.level,
            );
          if (!levelsFromMetadata.includes(selected.level) && !mappedLevel)
            return false;
        }
        return true;
      });

      const cards: IcaiResourceCard[] = filtered.map((resource) => {
        const source = sourceById.get(resource.source_id);
        const mappedAttemptIds = attemptIdsByResource.get(resource.id) ?? [];
        const mappedSubjectIds = subjectIdsByResource.get(resource.id) ?? [];
        const metadata =
          resource.metadata &&
          typeof resource.metadata === "object" &&
          !Array.isArray(resource.metadata)
            ? (resource.metadata as Record<string, unknown>)
            : {};
        const levelCodes = Array.isArray(metadata.level_codes)
          ? metadata.level_codes.filter(
              (value): value is string => typeof value === "string",
            )
          : [];
        return {
          id: resource.id,
          type: resource.resource_type as IcaiResourceType,
          title: resource.title,
          summary: resource.summary,
          officialUrl: resource.official_url,
          sourceName: source?.name ?? "ICAI",
          sourceUrl: source?.official_url ?? resource.official_url,
          firstSeenAt: resource.first_seen_at,
          lastVerifiedAt: resource.last_seen_at,
          lastChangedAt: resource.last_changed_at,
          publishedOn: resource.published_on,
          status: resource.status,
          levelCodes,
          attemptKeys: mappedAttemptIds
            .map((id) => attemptById.get(id)?.attempt_key)
            .filter((value): value is string => Boolean(value)),
          subjects: mappedSubjectIds
            .map((id) => subjectById.get(id))
            .filter((value): value is SubjectRow => Boolean(value))
            .map((row) => ({ id: row.id, title: row.title })),
        };
      });

      const eventCards = (events as EventRow[])
        .filter((event) => {
          const attempt = attemptById.get(event.attempt_id);
          const level = levelById.get(attempt?.level_id ?? "");
          if (selected.level && level?.code !== selected.level) return false;
          if (selected.attempt && attempt?.attempt_key !== selected.attempt)
            return false;
          if (selected.subject && event.subject_id !== selected.subject)
            return false;
          return true;
        })
        .map((event) => {
          const attempt = attemptById.get(event.attempt_id);
          const level = levelById.get(attempt?.level_id ?? "");
          return {
            id: event.id,
            title: event.title,
            eventType: event.event_type,
            eventDate: event.event_date,
            attemptKey: attempt?.attempt_key ?? "",
            attemptLabel: attempt?.label ?? "",
            levelCode: level?.code ?? "",
            sourceUrl: event.source_url,
            lastVerifiedAt: event.last_seen_at,
          };
        });

      const verifiedAt =
        [
          ...cards.map((item) => item.lastVerifiedAt),
          ...eventCards.map((item) => item.lastVerifiedAt),
        ]
          .sort()
          .at(-1) ?? null;

      return {
        resources: cards.sort((a, b) =>
          dateSort(
            a.publishedOn ?? a.lastVerifiedAt,
            b.publishedOn ?? b.lastVerifiedAt,
          ),
        ),
        events: eventCards,
        levels: levels.map((row: LevelRow) => ({
          code: row.code,
          name: row.name,
        })),
        attempts: attempts.map((row: AttemptRow) => ({
          id: row.id,
          key: row.attempt_key,
          label: row.label,
          levelCode: levelById.get(row.level_id)?.code ?? "",
          startDate: row.start_date,
          endDate: row.end_date,
          sourceUrl: row.source_url,
        })),
        subjects: subjects.map((row: SubjectRow) => ({
          id: row.id,
          title: row.title,
          levelCode: levelById.get(row.level_id)?.code ?? "",
        })),
        filters: selected,
        verifiedAt,
      };
    },
  });
}

export async function getIcaiAdminDashboard(): Promise<IcaiAdminDashboard> {
  const client = createD1AdminClient();
  const [
    runResponse,
    sourceResponse,
    reviewResponse,
    changeResponse,
    jobResponse,
    skipResponse,
  ] = await Promise.all([
    client
      .from("icai_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(12),
    client.from("icai_sources").select("*").order("id"),
    client
      .from("icai_review_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at")
      .limit(100),
    client
      .from("icai_change_events")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(100),
    client
      .from("background_jobs")
      .select("*")
      .eq("job_type", "icai-sync")
      .order("created_at", { ascending: false })
      .limit(20),
    client.from("icai_sync_item_skips").select("id,source_id,item_url,scope,skipped_until").eq("is_active", true).order("updated_at", { ascending: false }).limit(50),
  ]);

  const firstError = [
    runResponse.error,
    sourceResponse.error,
    reviewResponse.error,
    changeResponse.error,
    jobResponse.error,
    skipResponse.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const sources = (sourceResponse.data ?? []) as SourceRow[];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const runs = (runResponse.data ?? []) as SyncRunRow[];
  const run = runs[0] ?? null;
  const [snapshotResponse, runtimeResponse, sourceStateResponse] = run
    ? await Promise.all([
        client.from("icai_source_snapshots").select("*").eq("run_id", run.id),
        client.from("icai_sync_runtime").select("*").eq("run_id", run.id).maybeSingle(),
        client
          .from("icai_sync_source_states")
          .select("source_id,status,attempts,started_at,finished_at,cursor_offset,cursor_total,resolved_count,dropped_count,unavailable_count")
          .eq("run_id", run.id)
          .order("source_index"),
      ])
    : [
        { data: [], error: null },
        { data: null, error: null },
        { data: [], error: null },
      ];
  const runDetailError = [snapshotResponse.error, runtimeResponse.error, sourceStateResponse.error].find(Boolean);
  if (runDetailError) throw runDetailError;
  const runtime = runtimeResponse.data as Record<string, unknown> | null;
  const snapshots = (snapshotResponse.data ?? []) as Array<
    Record<string, unknown>
  >;
  const snapshotBySource = new Map(
    snapshots.map((snapshot) => [String(snapshot.source_id), snapshot]),
  );
  const jobs = (jobResponse.data ?? []) as Array<Record<string, unknown>>;
  const sourceStates = (sourceStateResponse.data ?? []) as Array<Record<string, unknown>>;
  const sourceMetrics = sourceStates.map((state) => ({
    sourceId: String(state.source_id),
    status: String(state.status),
    pagesChecked: Number(state.cursor_offset ?? 0),
    pdfsResolved: Number(state.resolved_count ?? 0),
    unavailablePages: Number(state.unavailable_count ?? 0),
    skippedPages: Number(state.dropped_count ?? 0),
    attempts: Number(state.attempts ?? 0),
    startedAt: state.started_at ? String(state.started_at) : null,
    finishedAt: state.finished_at ? String(state.finished_at) : null,
  }));
  const sumMetric = (key: "pagesChecked" | "pdfsResolved" | "unavailablePages" | "skippedPages") =>
    sourceMetrics.reduce((total, item) => total + item[key], 0);
  const activeJob =
    jobs.find((job) => job.status === "queued" || job.status === "running") ??
    null;
  const mapRun = (item: SyncRunRow) => ({
    id: item.id,
    status: item.status,
    triggerType: item.trigger_type,
    startedAt: item.started_at,
    completedAt: item.completed_at,
    sourceTotal: Number(item.source_total),
    sourceProcessed: Number(item.source_processed),
    sourceSucceeded: Number(item.source_succeeded),
    sourceFailed: Number(item.source_failed),
    newItems: Number(item.new_items),
    changedItems: Number(item.changed_items),
    unchangedItems: Number(item.unchanged_items),
    removedItems: Number(item.removed_items),
    pendingReviews: Number(item.pending_reviews),
    errorSummary: item.error_summary,
  });

  return {
    runtime: runtime
      ? {
          runId: String(runtime.run_id),
          stage: String(runtime.stage),
          currentSourceId: runtime.current_source_id
            ? String(runtime.current_source_id)
            : null,
          currentItemUrl: runtime.current_item_url
            ? String(runtime.current_item_url)
            : null,
          stageStartedAt: String(runtime.stage_started_at),
          heartbeatAt: String(runtime.heartbeat_at),
          cancelRequested: Boolean(runtime.cancel_requested),
          skipSourceRequested: Boolean(runtime.skip_source_requested),
          stale:
            Date.now() - new Date(String(runtime.heartbeat_at)).getTime() >
            2 * 60_000,
        }
      : null,
    activeJob: activeJob
      ? {
          id: String(activeJob.id),
          status: String(activeJob.status),
          attempts: Number(activeJob.attempts),
          maxAttempts: Number(activeJob.max_attempts),
          createdAt: String(activeJob.created_at),
          startedAt: activeJob.started_at ? String(activeJob.started_at) : null,
          finishedAt: activeJob.finished_at
            ? String(activeJob.finished_at)
            : null,
          lastError: activeJob.last_error ? String(activeJob.last_error) : null,
        }
      : null,
    latestRun: run ? mapRun(run) : null,
    recentRuns: runs.map(mapRun),
    sourceResults: sources.map((source) => {
      const snapshot = snapshotBySource.get(source.id);
      const failedThisRun = Boolean(
        run && source.last_error_at && source.last_error_at >= run.started_at,
      );
      return {
        sourceId: source.id,
        sourceName: source.name,
        state: snapshot
          ? ("fetched" as const)
          : failedThisRun
            ? ("failed" as const)
            : run
              ? ("pending" as const)
              : ("not_run" as const),
        httpStatus: snapshot ? Number(snapshot.http_status) : null,
        parsedItemCount: snapshot ? Number(snapshot.parsed_item_count) : null,
        changed: snapshot ? Boolean(snapshot.is_changed) : null,
        fetchedAt: snapshot?.fetched_at ? String(snapshot.fetched_at) : null,
        error: failedThisRun ? source.last_error : null,
      };
    }),
    sourceMetrics,
    operationalMetrics: {
      pagesChecked: sumMetric("pagesChecked"),
      pdfsResolved: sumMetric("pdfsResolved"),
      unavailablePages: sumMetric("unavailablePages"),
      skippedPages: sumMetric("skippedPages"),
      affectedRows: run ? Number(run.new_items) + Number(run.changed_items) + Number(run.unchanged_items) + Number(run.removed_items) : 0,
      reviewsCreated: run ? Number(run.pending_reviews) : 0,
      reviewsSuppressed: ((changeResponse.data ?? []) as ChangeRow[]).filter((change) => change.decision_status === "duplicate_suppressed").length,
    },
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      officialUrl: source.official_url,
      lastAttemptAt: source.last_attempt_at,
      lastSuccessAt: source.last_success_at,
      lastErrorAt: source.last_error_at,
      lastError: source.last_error,
      failures: source.consecutive_failures,
      parserVersion: source.parser_version,
      lastContentHash: source.last_content_hash,
      trustLevel: source.trust_level,
      authoritativeListing: source.authoritative_listing,
      isActive: source.is_active,
      excludedUntil: (source as SourceRow & { excluded_until?: string | null }).excluded_until ?? null,
    })),
    skippedItems: ((skipResponse.data ?? []) as Array<Record<string, unknown>>).map((item) => ({ id: String(item.id), sourceId: String(item.source_id), itemUrl: String(item.item_url), scope: String(item.scope), skippedUntil: item.skipped_until ? String(item.skipped_until) : null })),
    reviews: ((reviewResponse.data ?? []) as ReviewRow[]).map((review) => {
      const source = sourceById.get(review.source_id);
      const rawPatch = review.proposed_patch;
      const proposedPatch =
        rawPatch && typeof rawPatch === "object" && !Array.isArray(rawPatch)
          ? (rawPatch as Record<string, unknown>)
          : {};
      const proposedSourceUrl =
        typeof proposedPatch.source_url === "string"
          ? proposedPatch.source_url
          : null;
      return {
        id: review.id,
        title: review.title,
        reason: review.reason,
        entityType: review.entity_type,
        entityId: review.entity_id,
        confidence: review.confidence,
        sourceName: source?.name ?? review.source_id,
        sourceUrl: proposedSourceUrl ?? source?.official_url ?? "",
        proposedPatch,
        createdAt: review.created_at,
      };
    }),
    recentChanges: ((changeResponse.data ?? []) as ChangeRow[]).map(
      (change) => ({
        id: change.id,
        entityType: change.entity_type,
        entityId: change.entity_id,
        changeType: change.change_type,
        riskLevel: change.risk_level,
        decisionStatus: change.decision_status,
        detectedAt: change.detected_at,
      }),
    ),
  };
}
