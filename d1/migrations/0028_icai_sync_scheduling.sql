-- ICAI Sync Engine Phase 4 — distributed/adaptive scheduling.
-- Source scheduling is separate from the canonical source registry so operational
-- cadence can evolve without rewriting verified source configuration or health.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_sync_schedule_windows (
  window_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  ist_hour INTEGER NOT NULL CHECK (ist_hour BETWEEN 0 AND 23),
  window_kind TEXT NOT NULL CHECK (window_kind IN ('source','retry_failed','retry_high_impact','maintenance')),
  max_sources INTEGER NOT NULL DEFAULT 2 CHECK (max_sources BETWEEN 0 AND 2),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS icai_source_schedule (
  source_id TEXT PRIMARY KEY,
  sync_group TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes BETWEEN 360 AND 10080),
  next_due_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  jitter_minutes INTEGER NOT NULL DEFAULT 30 CHECK (jitter_minutes BETWEEN 0 AND 240),
  last_selected_at TEXT,
  last_completed_at TEXT,
  last_duration_ms INTEGER,
  last_response_bytes INTEGER,
  last_item_count INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_id) REFERENCES icai_sources(id) ON DELETE CASCADE,
  FOREIGN KEY(sync_group) REFERENCES icai_sync_schedule_windows(window_key)
);

CREATE INDEX IF NOT EXISTS idx_icai_source_schedule_due
  ON icai_source_schedule(next_due_at, priority DESC);
CREATE INDEX IF NOT EXISTS idx_icai_source_schedule_group_due
  ON icai_source_schedule(sync_group, next_due_at, priority DESC);
CREATE INDEX IF NOT EXISTS idx_icai_sync_items_retry_source
  ON icai_sync_items(retry_eligible, status, source_id, completed_at DESC);

INSERT INTO icai_sync_schedule_windows(window_key,label,ist_hour,window_kind,max_sources,enabled,sort_order)
VALUES
  ('reconciliation','Reconciliation & light cleanup',0,'maintenance',0,1,10),
  ('exam-announcements','Exam announcements',6,'source',2,1,20),
  ('foundation','Foundation sources',8,'source',2,1,30),
  ('intermediate','Intermediate sources',10,'source',2,1,40),
  ('final','Final sources',12,'source',2,1,50),
  ('bos-announcements','BOS announcements',14,'source',2,1,60),
  ('study-material','Study material',16,'source',2,1,70),
  ('failed-retry','Failed-item retry',18,'retry_failed',1,1,80),
  ('exam-schedules','Exam dates & schedules',20,'source',2,1,90),
  ('high-impact-retry','High-impact retry',22,'retry_high_impact',1,1,100)
ON CONFLICT(window_key) DO UPDATE SET
  label=excluded.label,
  ist_hour=excluded.ist_hour,
  window_kind=excluded.window_kind,
  max_sources=excluded.max_sources,
  enabled=excluded.enabled,
  sort_order=excluded.sort_order,
  updated_at=CURRENT_TIMESTAMP;

-- Backfill existing and newly seeded sources without overwriting operator schedule edits.
-- Course-level roots win before resource-type heuristics because the retained course
-- roots expose several resource classes on one page.
INSERT OR IGNORE INTO icai_source_schedule(
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
    WHEN lower(COALESCE(s.resource_types,'')) LIKE '%study_material%' AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%foundation%' AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%intermediate%' AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%final%' THEN 7200
    ELSE 1440
  END,
  CURRENT_TIMESTAMP,
  CASE WHEN s.trust_level='high_impact' THEN 100 ELSE 50 END,
  CASE
    WHEN lower(COALESCE(s.resource_types,'')) LIKE '%study_material%' AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%foundation%' AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%intermediate%' AND lower(COALESCE(s.level_codes,'')) NOT LIKE '%final%' THEN 180
    ELSE 30
  END
FROM icai_sources s
WHERE s.is_active=1;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0028','icai sync phase 4 distributed adaptive scheduling','84847b755426b165044bf46681fa2df8b8ce8d37');
