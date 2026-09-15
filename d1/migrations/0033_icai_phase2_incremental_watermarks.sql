-- ICAI Phase 2 — durable incremental checkpoint state.
-- Phase 1's adapter_config bootstrap flag remains as a compatibility mirror, while
-- this table becomes the durable per-source lock/high-water record used by Phase 2.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_source_watermarks (
  source_id TEXT PRIMARY KEY REFERENCES icai_sources(id) ON DELETE CASCADE,
  bootstrap_complete INTEGER NOT NULL DEFAULT 0 CHECK(bootstrap_complete IN (0,1)),
  bootstrap_completed_at TEXT,
  last_success_at TEXT,
  published_high_watermark TEXT,
  attempt_high_watermark TEXT,
  last_content_hash TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Preserve the already-certified Phase 1 lock when this migration reaches
-- production. A fresh database remains unlocked until its first successful sync.
INSERT OR IGNORE INTO icai_source_watermarks(
  source_id,
  bootstrap_complete,
  bootstrap_completed_at,
  last_success_at,
  published_high_watermark,
  attempt_high_watermark,
  last_content_hash,
  updated_at
)
SELECT
  s.id,
  CASE WHEN json_extract(s.adapter_config,'$.bootstrap_complete') = 1 THEN 1 ELSE 0 END,
  CASE
    WHEN json_extract(s.adapter_config,'$.bootstrap_complete') = 1
      THEN COALESCE(json_extract(s.adapter_config,'$.bootstrap_completed_at'), s.last_success_at)
    ELSE NULL
  END,
  s.last_success_at,
  (SELECT MAX(NULLIF(r.published_on,'')) FROM icai_resources r WHERE r.source_id=s.id),
  (SELECT MAX(a.attempt_key) FROM exam_attempts a WHERE a.source_id=s.id),
  s.last_content_hash,
  CURRENT_TIMESTAMP
FROM icai_sources s
WHERE s.is_active=1;

-- icai_sources.last_success_at is written only from the successful source path.
-- Centralizing advancement here therefore makes failed/aborted runs incapable of
-- moving the Phase 2 checkpoint.
CREATE TRIGGER IF NOT EXISTS icai_source_watermark_after_success
AFTER UPDATE OF last_success_at ON icai_sources
WHEN NEW.last_success_at IS NOT NULL
 AND COALESCE(OLD.last_success_at,'') <> COALESCE(NEW.last_success_at,'')
BEGIN
  INSERT INTO icai_source_watermarks(
    source_id,
    bootstrap_complete,
    bootstrap_completed_at,
    last_success_at,
    published_high_watermark,
    attempt_high_watermark,
    last_content_hash,
    updated_at
  )
  VALUES(
    NEW.id,
    1,
    COALESCE(
      (SELECT bootstrap_completed_at FROM icai_source_watermarks WHERE source_id=NEW.id),
      json_extract(NEW.adapter_config,'$.bootstrap_completed_at'),
      NEW.last_success_at
    ),
    NEW.last_success_at,
    (SELECT MAX(NULLIF(r.published_on,'')) FROM icai_resources r WHERE r.source_id=NEW.id),
    (SELECT MAX(a.attempt_key) FROM exam_attempts a WHERE a.source_id=NEW.id),
    NEW.last_content_hash,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(source_id) DO UPDATE SET
    bootstrap_complete=1,
    bootstrap_completed_at=COALESCE(icai_source_watermarks.bootstrap_completed_at, excluded.bootstrap_completed_at),
    last_success_at=excluded.last_success_at,
    published_high_watermark=CASE
      WHEN icai_source_watermarks.published_high_watermark IS NULL THEN excluded.published_high_watermark
      WHEN excluded.published_high_watermark IS NULL THEN icai_source_watermarks.published_high_watermark
      WHEN excluded.published_high_watermark > icai_source_watermarks.published_high_watermark THEN excluded.published_high_watermark
      ELSE icai_source_watermarks.published_high_watermark
    END,
    attempt_high_watermark=CASE
      WHEN icai_source_watermarks.attempt_high_watermark IS NULL THEN excluded.attempt_high_watermark
      WHEN excluded.attempt_high_watermark IS NULL THEN icai_source_watermarks.attempt_high_watermark
      WHEN excluded.attempt_high_watermark > icai_source_watermarks.attempt_high_watermark THEN excluded.attempt_high_watermark
      ELSE icai_source_watermarks.attempt_high_watermark
    END,
    last_content_hash=excluded.last_content_hash,
    updated_at=CURRENT_TIMESTAMP;
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0033','icai phase2 durable incremental watermarks','phase-12-operations-admin-platform');
