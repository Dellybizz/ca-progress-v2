import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { IcaiAdminDashboard, IcaiPublicCatalog, IcaiPublicFilters, IcaiResourceCard, IcaiResourceType } from "./types";

type LevelRow = Database["public"]["Tables"]["course_levels"]["Row"];
type AttemptRow = Database["public"]["Tables"]["exam_attempts"]["Row"];
type ResourceRow = Database["public"]["Tables"]["icai_resources"]["Row"];
type SourceRow = Database["public"]["Tables"]["icai_sources"]["Row"];
type SubjectRow = Database["public"]["Tables"]["subjects"]["Row"];
type AttemptMapRow = Database["public"]["Tables"]["resource_attempt_map"]["Row"];
type SubjectMapRow = Database["public"]["Tables"]["resource_subject_map"]["Row"];
type EventRow = Database["public"]["Tables"]["exam_events"]["Row"];

function cleanFilter(value: string | null | undefined) {
  const next = value?.trim() ?? "";
  if (!next || next === "all" || next.length > 120) return "";
  return next;
}

function dateSort(a: string | null, b: string | null) {
  return (b ?? "").localeCompare(a ?? "");
}

export async function getIcaiPublicCatalog(filters: IcaiPublicFilters = {}): Promise<IcaiPublicCatalog> {
  const supabase = await createServerSupabaseClient();
  const [levelsResponse, attemptsResponse, resourcesResponse, sourcesResponse, subjectsResponse, attemptMapResponse, subjectMapResponse, eventsResponse] = await Promise.all([
    supabase.from("course_levels").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("exam_attempts").select("*").eq("verification_status", "verified").order("attempt_key", { ascending: false }),
    supabase.from("icai_resources").select("*").eq("verification_status", "verified").eq("status", "active").order("last_seen_at", { ascending: false }).limit(500),
    supabase.from("icai_sources").select("*").eq("is_active", true),
    supabase.from("subjects").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("resource_attempt_map").select("*"),
    supabase.from("resource_subject_map").select("*"),
    supabase.from("exam_events").select("*").eq("verification_status", "verified").order("event_date").limit(150),
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

  const levels = levelsResponse.data ?? [];
  const attempts = attemptsResponse.data ?? [];
  const resources = resourcesResponse.data ?? [];
  const sources = sourcesResponse.data ?? [];
  const subjects = subjectsResponse.data ?? [];
  const attemptMaps = attemptMapResponse.data ?? [];
  const subjectMaps = subjectMapResponse.data ?? [];
  const events = eventsResponse.data ?? [];

  const selected = {
    level: cleanFilter(filters.level),
    attempt: cleanFilter(filters.attempt),
    subject: cleanFilter(filters.subject),
    type: cleanFilter(filters.type),
  };

  const levelById = new Map(levels.map((row: LevelRow) => [row.id, row]));
  const attemptById = new Map(attempts.map((row: AttemptRow) => [row.id, row]));
  const sourceById = new Map(sources.map((row: SourceRow) => [row.id, row]));
  const subjectById = new Map(subjects.map((row: SubjectRow) => [row.id, row]));

  const attemptIdsByResource = new Map<string, string[]>();
  for (const row of attemptMaps as AttemptMapRow[]) {
    attemptIdsByResource.set(row.resource_id, [...(attemptIdsByResource.get(row.resource_id) ?? []), row.attempt_id]);
  }
  const subjectIdsByResource = new Map<string, string[]>();
  for (const row of subjectMaps as SubjectMapRow[]) {
    subjectIdsByResource.set(row.resource_id, [...(subjectIdsByResource.get(row.resource_id) ?? []), row.subject_id]);
  }

  const filtered = (resources as ResourceRow[]).filter((resource) => {
    if (selected.type && resource.resource_type !== selected.type) return false;
    const mappedAttemptIds = attemptIdsByResource.get(resource.id) ?? [];
    const mappedSubjectIds = subjectIdsByResource.get(resource.id) ?? [];
    if (selected.attempt && !mappedAttemptIds.some((id) => attemptById.get(id)?.attempt_key === selected.attempt)) return false;
    if (selected.subject && !mappedSubjectIds.includes(selected.subject)) return false;
    if (selected.level) {
      const metadata = resource.metadata && typeof resource.metadata === "object" && !Array.isArray(resource.metadata)
        ? resource.metadata as Record<string, unknown>
        : {};
      const levelsFromMetadata = Array.isArray(metadata.level_codes)
        ? metadata.level_codes.filter((value): value is string => typeof value === "string")
        : [];
      const mappedLevel = mappedAttemptIds.some((id) => levelById.get(attemptById.get(id)?.level_id ?? "")?.code === selected.level)
        || mappedSubjectIds.some((id) => levelById.get(subjectById.get(id)?.level_id ?? "")?.code === selected.level);
      if (!levelsFromMetadata.includes(selected.level) && !mappedLevel) return false;
    }
    return true;
  });

  const cards: IcaiResourceCard[] = filtered.map((resource) => {
    const source = sourceById.get(resource.source_id);
    const mappedAttemptIds = attemptIdsByResource.get(resource.id) ?? [];
    const mappedSubjectIds = subjectIdsByResource.get(resource.id) ?? [];
    const metadata = resource.metadata && typeof resource.metadata === "object" && !Array.isArray(resource.metadata)
      ? resource.metadata as Record<string, unknown>
      : {};
    const levelCodes = Array.isArray(metadata.level_codes)
      ? metadata.level_codes.filter((value): value is string => typeof value === "string")
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
      attemptKeys: mappedAttemptIds.map((id) => attemptById.get(id)?.attempt_key).filter((value): value is string => Boolean(value)),
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
      if (selected.attempt && attempt?.attempt_key !== selected.attempt) return false;
      if (selected.subject && event.subject_id !== selected.subject) return false;
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

  const verifiedAt = [...cards.map((item) => item.lastVerifiedAt), ...eventCards.map((item) => item.lastVerifiedAt)].sort().at(-1) ?? null;

  return {
    resources: cards.sort((a, b) => dateSort(a.publishedOn ?? a.lastVerifiedAt, b.publishedOn ?? b.lastVerifiedAt)),
    events: eventCards,
    levels: levels.map((row: LevelRow) => ({ code: row.code, name: row.name })),
    attempts: attempts.map((row: AttemptRow) => ({ id: row.id, key: row.attempt_key, label: row.label, levelCode: levelById.get(row.level_id)?.code ?? "" })),
    subjects: subjects.map((row: SubjectRow) => ({ id: row.id, title: row.title, levelCode: levelById.get(row.level_id)?.code ?? "" })),
    filters: selected,
    verifiedAt,
  };
}

export async function getIcaiAdminDashboard(): Promise<IcaiAdminDashboard> {
  const supabase = createAdminSupabaseClient();
  const [runResponse, sourceResponse, reviewResponse, changeResponse] = await Promise.all([
    supabase.from("icai_sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("icai_sources").select("*").order("id"),
    supabase.from("icai_review_queue").select("*").eq("status", "pending").order("created_at").limit(100),
    supabase.from("icai_change_events").select("*").order("detected_at", { ascending: false }).limit(100),
  ]);

  const firstError = [runResponse.error, sourceResponse.error, reviewResponse.error, changeResponse.error].find(Boolean);
  if (firstError) throw firstError;

  const sources = sourceResponse.data ?? [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const run = runResponse.data;

  return {
    latestRun: run ? {
      id: run.id,
      status: run.status,
      triggerType: run.trigger_type,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      sourceTotal: run.source_total,
      sourceSucceeded: run.source_succeeded,
      sourceFailed: run.source_failed,
      newItems: run.new_items,
      changedItems: run.changed_items,
      unchangedItems: run.unchanged_items,
      removedItems: run.removed_items,
      pendingReviews: run.pending_reviews,
      errorSummary: run.error_summary,
    } : null,
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
    })),
    reviews: (reviewResponse.data ?? []).map((review) => {
      const source = sourceById.get(review.source_id);
      return {
        id: review.id,
        title: review.title,
        reason: review.reason,
        entityType: review.entity_type,
        entityId: review.entity_id,
        confidence: review.confidence,
        sourceName: source?.name ?? review.source_id,
        sourceUrl: source?.official_url ?? "",
        createdAt: review.created_at,
      };
    }),
    recentChanges: (changeResponse.data ?? []).map((change) => ({
      id: change.id,
      entityType: change.entity_type,
      entityId: change.entity_id,
      changeType: change.change_type,
      riskLevel: change.risk_level,
      decisionStatus: change.decision_status,
      detectedAt: change.detected_at,
    })),
  };
}
