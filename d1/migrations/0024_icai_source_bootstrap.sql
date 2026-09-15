-- ICAI Sync Engine Phase 2 — durable official source bootstrap.
-- These stable ICAI course category URLs are the canonical discovery roots for
-- Foundation, Intermediate and Final resources. Reapplying this migration repairs
-- configuration without erasing source health, validators, hashes or sync history.
PRAGMA foreign_keys = ON;

INSERT INTO icai_sources(
  id,name,official_url,source_type,trust_level,adapter_key,adapter_config,parser_version,
  authoritative_listing,resource_types,level_codes,request_interval_seconds,timeout_ms,is_active
) VALUES
(
  'icai-foundation-course',
  'ICAI Foundation Course',
  'https://www.icai.org/category/foundation-course',
  'course_resource_hub',
  'standard',
  'resource_hub',
  '{"allow_empty":false}',
  'phase8.1',
  1,
  '["rtp","mtp","study_material","statutory_update","amendment","question_paper","suggested_answer","schedule","announcement"]',
  '["foundation"]',
  4,
  15000,
  1
),
(
  'icai-intermediate-course',
  'ICAI Intermediate Course',
  'https://www.icai.org/category/intermediate-course',
  'course_resource_hub',
  'standard',
  'resource_hub',
  '{"allow_empty":false}',
  'phase8.1',
  1,
  '["rtp","mtp","study_material","statutory_update","amendment","question_paper","suggested_answer","schedule","announcement"]',
  '["intermediate"]',
  4,
  15000,
  1
),
(
  'icai-final-course',
  'ICAI Final Course',
  'https://www.icai.org/category/final-course',
  'course_resource_hub',
  'standard',
  'resource_hub',
  '{"allow_empty":false}',
  'phase8.1',
  1,
  '["rtp","mtp","study_material","statutory_update","amendment","question_paper","suggested_answer","schedule","announcement"]',
  '["final"]',
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
  is_active=1,
  updated_at=CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0024','icai sync phase 2 durable official course source bootstrap','84741ffa6675e560242a5f55688d9ba564e562f9');
