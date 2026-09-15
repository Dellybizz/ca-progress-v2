-- ICAI Phase 2C: immutable bootstrap lock and durable successful listing state.
PRAGMA foreign_keys = ON;

ALTER TABLE icai_source_watermarks ADD COLUMN last_listing_hash TEXT;
ALTER TABLE icai_sources ADD COLUMN last_listing_hash TEXT;

CREATE TRIGGER IF NOT EXISTS icai_source_listing_watermark_after_success
AFTER UPDATE OF last_success_at ON icai_sources
WHEN NEW.last_success_at IS NOT NULL
 AND COALESCE(OLD.last_success_at,'') <> COALESCE(NEW.last_success_at,'')
BEGIN
  INSERT INTO icai_source_watermarks(source_id,bootstrap_complete,bootstrap_completed_at,last_success_at,last_content_hash,last_listing_hash,updated_at)
  VALUES(NEW.id,0,NULL,NEW.last_success_at,NEW.last_content_hash,NEW.last_listing_hash,CURRENT_TIMESTAMP)
  ON CONFLICT(source_id) DO UPDATE SET
    last_listing_hash=excluded.last_listing_hash,
    updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS icai_source_watermark_bootstrap_immutable
BEFORE UPDATE OF bootstrap_complete,bootstrap_completed_at ON icai_source_watermarks
WHEN (OLD.bootstrap_complete=1 AND NEW.bootstrap_complete<>1)
  OR (OLD.bootstrap_completed_at IS NOT NULL AND COALESCE(NEW.bootstrap_completed_at,'')<>OLD.bootstrap_completed_at)
BEGIN
  SELECT RAISE(ABORT,'ICAI bootstrap completion is immutable');
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0036','icai phase2c immutable future-only state','phase-12-operations-admin-platform');
