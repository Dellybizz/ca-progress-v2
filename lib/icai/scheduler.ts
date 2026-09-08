export type IcaiSchedulerStatement = {
  bind(...values: unknown[]): IcaiSchedulerStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};

export type IcaiSchedulerDatabase = {
  prepare(sql: string): IcaiSchedulerStatement;
};

export type IcaiScheduleWindowKind =
  | "source"
  | "retry_failed"
  | "retry_high_impact"
  | "maintenance";

export type IcaiScheduleWindow = {
  key: string;
  label: string;
  istHour: number;
  kind: IcaiScheduleWindowKind;
  maxSources: number;
};

export type IcaiSourceScheduleState = {
  sourceId: string;
  syncGroup: string;
  intervalMinutes: number;
  nextDueAt: string;
  priority: number;
  jitterMinutes: number;
  lastSelectedAt: string | null;
  lastCompletedAt: string | null;
  lastDurationMs: number | null;
  lastResponseBytes: number | null;
  lastItemCount: number | null;
  pausedUntil: string | null;
};

export type IcaiScheduleOverview = {
  nextScheduledGroup: { key: string; label: string; scheduledFor: string } | null;
  dueSources: number;
  pausedSources: number;
};

export type IcaiScheduledDispatch =
  | {
      status: "dispatch";
      window: IcaiScheduleWindow;
      sourceIds: string[];
      retryRunId: string | null;
      retryMode: "failed" | "timed_out" | null;
      reason: string;
    }
  | {
      status: "deferred" | "idle" | "maintenance";
      window: IcaiScheduleWindow | null;
      sourceIds: [];
      retryRunId: null;
      retryMode: null;
      reason: string;
    };

export type IcaiManualSyncMode = "due" | "source" | "group" | "failed" | "high-impact" | "all";

const IST_OFFSET_MINUTES = 330;
const MAX_MANUAL_SOURCES = 20;

function iso(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid ICAI scheduling timestamp.");
  return date.toISOString();
}

function istParts(now: Date) {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

function nextIstHourOccurrence(now: Date, hour: number) {
  const parts = istParts(now);
  const shiftedNow = now.getTime() + IST_OFFSET_MINUTES * 60_000;
  let targetShifted = Date.UTC(parts.year, parts.month, parts.day, hour, 0, 0, 0);
  if (targetShifted <= shiftedNow) targetShifted += 24 * 60 * 60_000;
  return new Date(targetShifted - IST_OFFSET_MINUTES * 60_000).toISOString();
}

function mapWindow(row: Record<string, unknown>): IcaiScheduleWindow {
  return {
    key: String(row.window_key),
    label: String(row.label),
    istHour: Number(row.ist_hour),
    kind: String(row.window_kind) as IcaiScheduleWindowKind,
    maxSources: Number(row.max_sources),
  };
}

export async function ensureIcaiSourceSchedules(db: IcaiSchedulerDatabase) {
  await db.prepare(`INSERT OR IGNORE INTO icai_source_schedule(
    source_id,sync_group,interval_minutes,next_due_at,priority,jitter_minutes
  )
  SELECT
    s.id,
    CASE
      WHEN lower(COALESCE(s.level_codes,'')) LIKE '%foundation%' THEN 'foundation'
      WHEN lower(COALESCE(s.level_codes,'')) LIKE '%intermediate%' THEN 'intermediate'
      WHEN lower(COALESCE(s.level_codes,'')) LIKE '%final%' THEN 'final'
      WHEN lower(COALESCE(s.name,'') || ' ' || COALESCE(s.source_type,'')) LIKE '%bos%' THEN 'bos-announcements'
      WHEN s.trust_level='high_impact' AND lower(COALESCE(s.resource_types,'')) LIKE '%schedule%' THEN 'exam-schedules'
      WHEN lower(COALESCE(s.resource_types,'')) LIKE '%study_material%' THEN 'study-material'
      WHEN lower(COALESCE(s.resource_types,'')) LIKE '%schedule%' THEN 'exam-schedules'
      ELSE 'exam-announcements'
    END,
    CASE
      WHEN s.trust_level='high_impact' THEN 480
      WHEN lower(COALESCE(s.resource_types,'')) LIKE '%study_material%'
        AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%foundation%'
        AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%intermediate%'
        AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%final%' THEN 7200
      ELSE 1440
    END,
    CURRENT_TIMESTAMP,
    CASE WHEN s.trust_level='high_impact' THEN 100 ELSE 50 END,
    CASE
      WHEN lower(COALESCE(s.resource_types,'')) LIKE '%study_material%'
        AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%foundation%'
        AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%intermediate%'
        AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%final%' THEN 180
      ELSE 30
    END
  FROM icai_sources s
  LEFT JOIN icai_source_schedule existing ON existing.source_id=s.id
  WHERE s.is_active=1 AND existing.source_id IS NULL`).run();
}

async function enabledWindows(db: IcaiSchedulerDatabase) {
  const result = await db.prepare(`SELECT window_key,label,ist_hour,window_kind,max_sources
    FROM icai_sync_schedule_windows WHERE enabled=1 ORDER BY sort_order,ist_hour`).all<Record<string, unknown>>();
  return (result.results ?? []).map(mapWindow);
}

export async function getIcaiScheduleOverview(
  db: IcaiSchedulerDatabase,
  nowValue: Date | string | number = new Date(),
): Promise<IcaiScheduleOverview> {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const currentIso = iso(now);
  const [windows, dueRow, pausedRow] = await Promise.all([
    enabledWindows(db),
    db.prepare(`SELECT COUNT(*) AS count
      FROM icai_source_schedule sch
      JOIN icai_sources s ON s.id=sch.source_id AND s.is_active=1
      LEFT JOIN icai_source_controls ctl ON ctl.source_id=s.id
      WHERE datetime(sch.next_due_at)<=datetime(?1)
        AND (ctl.paused_until IS NULL OR datetime(ctl.paused_until)<=datetime(?1))`)
      .bind(currentIso).first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM icai_source_controls
      WHERE paused_until IS NOT NULL AND datetime(paused_until)>datetime(?1)`)
      .bind(currentIso).first<{ count: number }>(),
  ]);
  const future = windows
    .map((window) => ({ window, scheduledFor: nextIstHourOccurrence(now, window.istHour) }))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0];
  return {
    nextScheduledGroup: future
      ? { key: future.window.key, label: future.window.label, scheduledFor: future.scheduledFor }
      : null,
    dueSources: Number(dueRow?.count ?? 0),
    pausedSources: Number(pausedRow?.count ?? 0),
  };
}

export async function getIcaiSourceScheduleStates(db: IcaiSchedulerDatabase) {
  const result = await db.prepare(`SELECT
      sch.source_id,sch.sync_group,sch.interval_minutes,sch.next_due_at,sch.priority,sch.jitter_minutes,
      sch.last_selected_at,sch.last_completed_at,sch.last_duration_ms,sch.last_response_bytes,sch.last_item_count,
      ctl.paused_until
    FROM icai_source_schedule sch
    LEFT JOIN icai_source_controls ctl ON ctl.source_id=sch.source_id
    ORDER BY sch.priority DESC,sch.next_due_at,sch.source_id`).all<Record<string, unknown>>();
  return (result.results ?? []).map((row): IcaiSourceScheduleState => ({
    sourceId: String(row.source_id),
    syncGroup: String(row.sync_group),
    intervalMinutes: Number(row.interval_minutes),
    nextDueAt: String(row.next_due_at),
    priority: Number(row.priority),
    jitterMinutes: Number(row.jitter_minutes),
    lastSelectedAt: row.last_selected_at == null ? null : String(row.last_selected_at),
    lastCompletedAt: row.last_completed_at == null ? null : String(row.last_completed_at),
    lastDurationMs: row.last_duration_ms == null ? null : Number(row.last_duration_ms),
    lastResponseBytes: row.last_response_bytes == null ? null : Number(row.last_response_bytes),
    lastItemCount: row.last_item_count == null ? null : Number(row.last_item_count),
    pausedUntil: row.paused_until == null ? null : String(row.paused_until),
  }));
}

async function activeSyncExists(db: IcaiSchedulerDatabase) {
  const row = await db.prepare(`SELECT 1 AS active FROM icai_sync_runs
      WHERE status IN ('queued','running') LIMIT 1`).first<{ active: number }>();
  if (row) return true;
  const job = await db.prepare(`SELECT 1 AS active FROM background_jobs
      WHERE job_type='icai-sync' AND status IN ('queued','running') LIMIT 1`).first<{ active: number }>();
  return Boolean(job);
}

async function dueSourcesForGroup(
  db: IcaiSchedulerDatabase,
  group: string,
  nowIso: string,
  limit: number,
) {
  const result = await db.prepare(`SELECT s.id
    FROM icai_source_schedule sch
    JOIN icai_sources s ON s.id=sch.source_id AND s.is_active=1
    LEFT JOIN icai_source_controls ctl ON ctl.source_id=s.id
    WHERE sch.sync_group=?1
      AND datetime(sch.next_due_at)<=datetime(?2)
      AND (ctl.paused_until IS NULL OR datetime(ctl.paused_until)<=datetime(?2))
    ORDER BY sch.priority DESC,datetime(sch.next_due_at),s.id
    LIMIT ?3`).bind(group, nowIso, limit).all<{ id: string }>();
  return (result.results ?? []).map((row) => row.id);
}

async function adaptiveHighImpactSources(
  db: IcaiSchedulerDatabase,
  nowIso: string,
  remaining: number,
  excluded: string[],
) {
  if (remaining <= 0) return [];
  const placeholders = excluded.map((_, index) => `?${index + 3}`).join(",");
  const exclusion = excluded.length ? `AND s.id NOT IN (${placeholders})` : "";
  const result = await db.prepare(`SELECT s.id
    FROM icai_source_schedule sch
    JOIN icai_sources s ON s.id=sch.source_id AND s.is_active=1 AND s.trust_level='high_impact'
    LEFT JOIN icai_source_controls ctl ON ctl.source_id=s.id
    WHERE datetime(sch.next_due_at)<=datetime(?1)
      AND (ctl.paused_until IS NULL OR datetime(ctl.paused_until)<=datetime(?1))
      ${exclusion}
    ORDER BY sch.priority DESC,datetime(sch.next_due_at),s.id
    LIMIT ?2`).bind(nowIso, remaining, ...excluded).all<{ id: string }>();
  return (result.results ?? []).map((row) => row.id);
}

async function retryCandidate(db: IcaiSchedulerDatabase, highImpactOnly: boolean, nowIso: string) {
  const row = await db.prepare(`SELECT i.run_id,i.source_id,i.status
    FROM icai_sync_items i
    JOIN icai_sources s ON s.id=i.source_id AND s.is_active=1
    LEFT JOIN icai_source_controls ctl ON ctl.source_id=s.id
    WHERE i.retry_eligible=1
      AND i.status IN ('failed','timed_out')
      AND (?1=0 OR s.trust_level='high_impact')
      AND (ctl.paused_until IS NULL OR datetime(ctl.paused_until)<=datetime(?2))
    ORDER BY datetime(COALESCE(i.completed_at,i.started_at,i.created_at)) DESC
    LIMIT 1`).bind(highImpactOnly ? 1 : 0, nowIso).first<{ run_id: string; source_id: string; status: string }>();
  return row ?? null;
}

export async function selectIcaiScheduledDispatch(
  db: IcaiSchedulerDatabase,
  scheduledTime: Date | string | number,
): Promise<IcaiScheduledDispatch> {
  const now = scheduledTime instanceof Date ? scheduledTime : new Date(scheduledTime);
  const nowIso = iso(now);
  await ensureIcaiSourceSchedules(db);
  const windows = await enabledWindows(db);
  const hour = istParts(now).hour;
  const window = windows.find((candidate) => candidate.istHour === hour) ?? null;
  if (!window) {
    return { status: "idle", window: null, sourceIds: [], retryRunId: null, retryMode: null, reason: `No ICAI schedule window is configured for ${hour}:00 IST.` };
  }
  if (await activeSyncExists(db)) {
    return { status: "deferred", window, sourceIds: [], retryRunId: null, retryMode: null, reason: "Another ICAI sync is queued or running; due work remains due for a later window." };
  }
  if (window.kind === "maintenance") {
    return { status: "maintenance", window, sourceIds: [], retryRunId: null, retryMode: null, reason: "Schedule reconciliation completed; no source fetch is required in this window." };
  }
  if (window.kind === "retry_failed" || window.kind === "retry_high_impact") {
    const candidate = await retryCandidate(db, window.kind === "retry_high_impact", nowIso);
    if (!candidate) {
      return { status: "idle", window, sourceIds: [], retryRunId: null, retryMode: null, reason: "No retry-eligible ICAI item is due for this retry window." };
    }
    return {
      status: "dispatch",
      window,
      sourceIds: [candidate.source_id],
      retryRunId: candidate.run_id,
      retryMode: candidate.status === "timed_out" ? "timed_out" : "failed",
      reason: "Retrying only the affected source and matching failed item class.",
    };
  }

  const selected = await dueSourcesForGroup(db, window.key, nowIso, window.maxSources);
  if (selected.length < window.maxSources) {
    const adaptive = await adaptiveHighImpactSources(db, nowIso, window.maxSources - selected.length, selected);
    selected.push(...adaptive);
  }
  if (!selected.length) {
    return { status: "idle", window, sourceIds: [], retryRunId: null, retryMode: null, reason: "No source in this window is due; the registry will not be fetched unnecessarily." };
  }
  return {
    status: "dispatch",
    window,
    sourceIds: selected,
    retryRunId: null,
    retryMode: null,
    reason: `Selected ${selected.length} due source${selected.length === 1 ? "" : "s"} for this two-hour window.`,
  };
}

export async function markIcaiScheduleDispatched(
  db: IcaiSchedulerDatabase,
  sourceIds: string[],
  selectedAt: Date | string | number = new Date(),
) {
  if (!sourceIds.length) return;
  const at = iso(selectedAt);
  for (const sourceId of sourceIds) {
    await db.prepare(`UPDATE icai_source_schedule SET last_selected_at=?1,updated_at=?1 WHERE source_id=?2`)
      .bind(at, sourceId).run();
  }
}

function deterministicJitterMinutes(sourceId: string, maximum: number) {
  if (maximum <= 0) return 0;
  let hash = 0;
  for (const char of sourceId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const minimum = Math.min(maximum, Math.max(1, Math.floor(maximum / 2)));
  return minimum + (hash % (maximum - minimum + 1));
}

export async function recordIcaiSourceScheduleResult(
  db: IcaiSchedulerDatabase,
  sourceId: string,
  result: {
    success: boolean;
    completedAt?: Date | string | number;
    durationMs?: number | null;
    responseBytes?: number | null;
    itemCount?: number | null;
  },
) {
  const completedAt = iso(result.completedAt ?? new Date());
  const schedule = await db.prepare(`SELECT interval_minutes,jitter_minutes FROM icai_source_schedule WHERE source_id=?1`)
    .bind(sourceId).first<{ interval_minutes: number; jitter_minutes: number }>();
  if (!schedule) return;
  const metrics = [
    result.durationMs == null ? null : Math.max(0, Math.round(result.durationMs)),
    result.responseBytes == null ? null : Math.max(0, Math.round(result.responseBytes)),
    result.itemCount == null ? null : Math.max(0, Math.round(result.itemCount)),
  ];
  if (!result.success) {
    await db.prepare(`UPDATE icai_source_schedule SET
      last_completed_at=?1,last_duration_ms=COALESCE(?2,last_duration_ms),last_response_bytes=COALESCE(?3,last_response_bytes),
      last_item_count=COALESCE(?4,last_item_count),updated_at=?1 WHERE source_id=?5`)
      .bind(completedAt, ...metrics, sourceId).run();
    return;
  }
  const interval = Math.max(360, Number(schedule.interval_minutes));
  const jitter = deterministicJitterMinutes(sourceId, Math.max(0, Number(schedule.jitter_minutes)));
  const nextDueAt = new Date(new Date(completedAt).getTime() + Math.max(360, interval - jitter) * 60_000).toISOString();
  await db.prepare(`UPDATE icai_source_schedule SET
    next_due_at=?1,last_completed_at=?2,last_duration_ms=COALESCE(?3,last_duration_ms),last_response_bytes=COALESCE(?4,last_response_bytes),
    last_item_count=COALESCE(?5,last_item_count),updated_at=?2 WHERE source_id=?6`)
    .bind(nextDueAt, completedAt, ...metrics, sourceId).run();
}

export async function selectIcaiManualDispatch(
  db: IcaiSchedulerDatabase,
  input: { mode: IcaiManualSyncMode; value?: string | null; now?: Date | string | number },
) {
  const nowIso = iso(input.now ?? new Date());
  await ensureIcaiSourceSchedules(db);
  if (input.mode === "failed") {
    const candidate = await retryCandidate(db, false, nowIso);
    return candidate
      ? { sourceIds: [candidate.source_id], retryRunId: candidate.run_id, retryMode: candidate.status === "timed_out" ? "timed_out" as const : "failed" as const }
      : { sourceIds: [], retryRunId: null, retryMode: null };
  }

  const filters: string[] = ["s.is_active=1", "(ctl.paused_until IS NULL OR datetime(ctl.paused_until)<=datetime(?1))"];
  const values: unknown[] = [nowIso];
  if (input.mode === "due") filters.push("datetime(sch.next_due_at)<=datetime(?1)");
  if (input.mode === "source") {
    values.push(String(input.value ?? ""));
    filters.push(`s.id=?${values.length}`);
  }
  if (input.mode === "group") {
    values.push(String(input.value ?? ""));
    filters.push(`sch.sync_group=?${values.length}`);
  }
  if (input.mode === "high-impact") filters.push("s.trust_level='high_impact'");
  const result = await db.prepare(`SELECT s.id FROM icai_sources s
    JOIN icai_source_schedule sch ON sch.source_id=s.id
    LEFT JOIN icai_source_controls ctl ON ctl.source_id=s.id
    WHERE ${filters.join(" AND ")}
    ORDER BY sch.priority DESC,datetime(sch.next_due_at),s.id LIMIT ${MAX_MANUAL_SOURCES}`)
    .bind(...values).all<{ id: string }>();
  return { sourceIds: (result.results ?? []).map((row) => row.id), retryRunId: null, retryMode: null };
}
