-- ICAI Phase 1 deterministic current bootstrap sources.
-- Seed exactly the New Scheme academic hierarchy plus the immediately previous
-- May 2026 examination, the current Sep/Nov 2026 examination hub, and current
-- BoS student announcements. The next successful source run may then be frozen
-- and handed to Phase 2 incremental-only processing.
PRAGMA foreign_keys = ON;

UPDATE icai_sources
SET official_url = CASE id
      WHEN 'icai-foundation-course' THEN 'https://www.icai.org/post/foundation-nset'
      WHEN 'icai-intermediate-course' THEN 'https://www.icai.org/post/intermediate-nset'
      WHEN 'icai-final-course' THEN 'https://www.icai.org/post/final-nset'
      ELSE official_url
    END,
    source_type = 'new_scheme_resource_hub',
    authoritative_listing = 1,
    adapter_config = json_set(
      COALESCE(adapter_config, '{}'),
      '$.allow_empty', json('false'),
      '$.bootstrap_profile', 'phase1-current-window-v1',
      '$.bootstrap_attempt_floor', '2026-05',
      '$.bootstrap_published_floor', '2025-12-01',
      '$.bootstrap_complete', json('false'),
      '$.bootstrap_completed_at', NULL,
      '$.direct_study_material_pdfs', json('true'),
      '$.direct_pdf_max_depth', 3
    ),
    last_content_hash = NULL,
    etag = NULL,
    last_modified = NULL,
    is_active = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  'icai-foundation-course',
  'icai-intermediate-course',
  'icai-final-course'
);

INSERT INTO icai_sources(
  id,name,official_url,source_type,trust_level,adapter_key,adapter_config,parser_version,
  authoritative_listing,resource_types,level_codes,request_interval_seconds,timeout_ms,is_active
) VALUES
(
  'icai-exam-may-2026',
  'ICAI Examinations - May 2026',
  'https://www.icai.org/post/exam-may-2026',
  'exam_attempt_hub',
  'high_impact',
  'anchor_feed',
  '{"allow_empty":false,"bootstrap_profile":"phase1-current-window-v1","bootstrap_attempt_floor":"2026-05","bootstrap_published_floor":"2025-12-01","bootstrap_complete":false,"bootstrap_completed_at":null,"direct_study_material_pdfs":true}',
  'phase8.1',
  0,
  '["question_paper","schedule","announcement"]',
  '["foundation","intermediate","final"]',
  4,
  15000,
  1
),
(
  'icai-exam-sep-nov-2026',
  'ICAI Examinations - September & November 2026',
  'https://www.icai.org/post/24137',
  'exam_attempt_hub',
  'high_impact',
  'anchor_feed',
  '{"allow_empty":false,"bootstrap_profile":"phase1-current-window-v1","bootstrap_attempt_floor":"2026-05","bootstrap_published_floor":"2025-12-01","bootstrap_complete":false,"bootstrap_completed_at":null,"direct_study_material_pdfs":true}',
  'phase8.1',
  0,
  '["question_paper","schedule","announcement"]',
  '["foundation","intermediate","final"]',
  4,
  15000,
  1
),
(
  'icai-bos-important-announcements',
  'ICAI BoS Important Announcements',
  'https://www.icai.org/category/bos-important-announcements/1',
  'bos_student_announcements',
  'standard',
  'anchor_feed',
  '{"allow_empty":false,"bootstrap_profile":"phase1-current-window-v1","bootstrap_attempt_floor":"2026-05","bootstrap_published_floor":"2025-12-01","bootstrap_complete":false,"bootstrap_completed_at":null,"direct_study_material_pdfs":true}',
  'phase8.1',
  0,
  '["rtp","mtp","statutory_update","amendment","schedule","announcement"]',
  '["foundation","intermediate","final"]',
  4,
  15000,
  1
)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  official_url=excluded.official_url,
  source_type=excluded.source_type,
  trust_level=excluded.trust_level,
  adapter_key=excluded.adapter_key,
  adapter_config=excluded.adapter_config,
  parser_version=excluded.parser_version,
  authoritative_listing=excluded.authoritative_listing,
  resource_types=excluded.resource_types,
  level_codes=excluded.level_codes,
  request_interval_seconds=excluded.request_interval_seconds,
  timeout_ms=excluded.timeout_ms,
  last_content_hash=NULL,
  etag=NULL,
  last_modified=NULL,
  is_active=1,
  updated_at=CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0030','icai phase 1 deterministic current bootstrap sources','phase-12-operations-admin-platform');
