-- ICAI Phase 1 runs only the six explicitly approved current-data sources.
-- Historical source rows remain available for audit but cannot be selected.
PRAGMA foreign_keys = ON;

UPDATE icai_sources
SET is_active = 0, updated_at = CURRENT_TIMESTAMP
WHERE id NOT IN (
  'icai-foundation-course',
  'icai-intermediate-course',
  'icai-final-course',
  'icai-exam-may-2026',
  'icai-exam-sep-nov-2026',
  'icai-bos-important-announcements'
);

UPDATE icai_sources
SET is_active = 1, updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  'icai-foundation-course',
  'icai-intermediate-course',
  'icai-final-course',
  'icai-exam-may-2026',
  'icai-exam-sep-nov-2026',
  'icai-bos-important-announcements'
);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0031','icai phase 1 exact six-source scope','phase-12-operations-admin-platform');
