-- Add automatic discovery, not exam dates. Existing sources and data are retained.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS icai_exam_document_cache (
  url TEXT PRIMARY KEY,
  etag TEXT,
  last_modified TEXT,
  content_hash TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  payload TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO icai_sources(
 id,name,official_url,source_type,trust_level,adapter_key,adapter_config,parser_version,
 authoritative_listing,resource_types,level_codes,request_interval_seconds,timeout_ms,is_active
) VALUES (
 'icai-live-exam-schedules','ICAI Live Examination Schedules',
 'https://www.icai.org/students.shtml?mod=4','exam_schedule_index','high_impact','anchor_feed',
 '{"allow_empty":true,"bootstrap_attempt_floor":"2026-05","bootstrap_published_floor":"2025-12-01","direct_study_material_pdfs":false}',
 'phase8.1',0,'["schedule"]','["foundation","intermediate","final"]',4,15000,1
) ON CONFLICT(id) DO NOTHING;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0041','automatic official examination schedule discovery and PDF cache','phase-12-operations-admin-platform');
