-- ICAI bounded bootstrap policy.
-- The next successful source run imports only the current bootstrap window,
-- then the worker flips that source to incremental mode in adapter_config.
PRAGMA foreign_keys = ON;

UPDATE icai_sources
SET adapter_config = json_set(
      COALESCE(adapter_config, '{}'),
      '$.allow_empty', 0,
      '$.bootstrap_attempt_floor', '2026-05',
      '$.bootstrap_published_floor', '2025-12-01',
      '$.bootstrap_complete', json('false'),
      '$.bootstrap_completed_at', NULL,
      '$.direct_study_material_pdfs', json('true')
    ),
    -- Force one full response for the intentional bootstrap pass. Old validators
    -- could otherwise return 304 and skip the bounded seed import.
    last_content_hash = NULL,
    etag = NULL,
    last_modified = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  'icai-foundation-course',
  'icai-intermediate-course',
  'icai-final-course'
);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0029','icai bounded bootstrap window and direct study material pdf mode','phase-12-operations-admin-platform');
