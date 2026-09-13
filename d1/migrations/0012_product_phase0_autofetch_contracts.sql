-- CA Progress Product Plan — Phase 0
-- Self-healing source registry, stable resource identity, provenance and direct-document contracts.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS autofetch_content_targets (
  id TEXT PRIMARY KEY,
  organization TEXT NOT NULL,
  content_type TEXT NOT NULL,
  canonical_node_id TEXT REFERENCES academic_catalog_nodes(canonical_id) ON DELETE SET NULL,
  level_id TEXT REFERENCES course_levels(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES course_groups(id) ON DELETE SET NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  attempt_id TEXT REFERENCES exam_attempts(id) ON DELETE SET NULL,
  expected_title_patterns TEXT NOT NULL DEFAULT '[]',
  expected_keywords TEXT NOT NULL DEFAULT '[]',
  expected_document_types TEXT NOT NULL DEFAULT '[]',
  criticality TEXT NOT NULL DEFAULT 'routine' CHECK (criticality IN ('routine','high_impact','critical')),
  auto_publish_policy TEXT NOT NULL DEFAULT 'verified_auto' CHECK (auto_publish_policy IN ('verified_auto','review_high_impact','manual_only')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(expected_title_patterns)),
  CHECK (json_valid(expected_keywords)),
  CHECK (json_valid(expected_document_types)),
  CHECK (json_valid(metadata))
);

CREATE TABLE IF NOT EXISTS autofetch_source_registry (
  source_id TEXT PRIMARY KEY REFERENCES icai_sources(id) ON DELETE CASCADE,
  target_id TEXT REFERENCES autofetch_content_targets(id) ON DELETE SET NULL,
  discovery_root_url TEXT,
  current_source_page_url TEXT NOT NULL,
  health_status TEXT NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy','degraded','discovery_running','parser_anomaly','review_required','disabled')),
  current_confidence REAL NOT NULL DEFAULT 1 CHECK (current_confidence BETWEEN 0 AND 1),
  last_discovery_at TEXT,
  last_verified_location_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(metadata))
);

CREATE TABLE IF NOT EXISTS autofetch_source_locations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('source_page','discovery_root','redirect_target','historical')),
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current','previous','redirected','broken','review_required')),
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redirected_to_url TEXT,
  content_hash TEXT,
  http_status INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}',
  CHECK (json_valid(metadata)),
  UNIQUE(source_id,url,location_type)
);

CREATE TABLE IF NOT EXISTS autofetch_discovery_candidates (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  target_id TEXT REFERENCES autofetch_content_targets(id) ON DELETE SET NULL,
  candidate_url TEXT NOT NULL,
  discovered_via TEXT NOT NULL CHECK (discovered_via IN ('redirect','parent_index','sitemap','official_search','external_search','manual')),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected','review_required')),
  reasons TEXT NOT NULL DEFAULT '[]',
  content_fingerprint TEXT,
  reviewed_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(reasons)),
  UNIQUE(source_id,candidate_url)
);

CREATE TABLE IF NOT EXISTS autofetch_resource_records (
  resource_row_id TEXT PRIMARY KEY REFERENCES icai_resources(id) ON DELETE CASCADE,
  canonical_resource_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE RESTRICT,
  target_id TEXT REFERENCES autofetch_content_targets(id) ON DELETE SET NULL,
  identity_material TEXT NOT NULL,
  source_page_url TEXT,
  direct_file_url TEXT,
  direct_file_mime_type TEXT,
  direct_file_verified_at TEXT,
  health_status TEXT NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy','stale','broken','review_required')),
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0,1)),
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS autofetch_resource_locations (
  id TEXT PRIMARY KEY,
  resource_row_id TEXT NOT NULL REFERENCES icai_resources(id) ON DELETE CASCADE,
  canonical_resource_id TEXT NOT NULL,
  url TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('source_page','direct_file','redirect_target','historical')),
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current','previous','redirected','broken','review_required')),
  mime_type TEXT,
  content_hash TEXT,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT NOT NULL DEFAULT '{}',
  CHECK (json_valid(metadata)),
  UNIQUE(canonical_resource_id,url,location_type)
);

CREATE TABLE IF NOT EXISTS autofetch_resource_versions (
  id TEXT PRIMARY KEY,
  canonical_resource_id TEXT NOT NULL,
  resource_row_id TEXT NOT NULL REFERENCES icai_resources(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  source_page_url TEXT,
  direct_file_url TEXT,
  verification_status TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT NOT NULL DEFAULT '{}',
  CHECK (json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS autofetch_targets_scope_idx ON autofetch_content_targets(level_id,group_id,subject_id,attempt_id,enabled);
CREATE INDEX IF NOT EXISTS autofetch_source_health_idx ON autofetch_source_registry(health_status,updated_at);
CREATE INDEX IF NOT EXISTS autofetch_source_locations_current_idx ON autofetch_source_locations(source_id,status,last_seen_at);
CREATE INDEX IF NOT EXISTS autofetch_candidates_review_idx ON autofetch_discovery_candidates(verification_status,confidence,created_at);
CREATE INDEX IF NOT EXISTS autofetch_resource_canonical_idx ON autofetch_resource_records(canonical_resource_id,is_current,last_seen_at);
CREATE INDEX IF NOT EXISTS autofetch_resource_source_idx ON autofetch_resource_records(source_id,is_current,last_seen_at);
CREATE INDEX IF NOT EXISTS autofetch_resource_locations_idx ON autofetch_resource_locations(canonical_resource_id,location_type,status,last_seen_at);
CREATE INDEX IF NOT EXISTS autofetch_resource_versions_idx ON autofetch_resource_versions(canonical_resource_id,captured_at);

-- Existing ICAI sources become initial content targets. These source-shaped targets
-- are intentionally conservative; later product phases can split them into more
-- precise attempt/subject/AS targets without changing source identity.
INSERT OR IGNORE INTO autofetch_content_targets (
  id,organization,content_type,expected_title_patterns,expected_keywords,expected_document_types,
  criticality,auto_publish_policy,enabled,metadata,created_at,updated_at
)
SELECT
  'target-source-' || id,
  'ICAI',
  source_type,
  '[]',
  '[]',
  resource_types,
  CASE WHEN trust_level='high_impact' THEN 'high_impact' ELSE 'routine' END,
  CASE WHEN trust_level='high_impact' THEN 'review_high_impact' ELSE 'verified_auto' END,
  is_active,
  json_object('legacy_source_id',id,'level_codes',json(level_codes)),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM icai_sources;

INSERT OR IGNORE INTO autofetch_source_registry (
  source_id,target_id,discovery_root_url,current_source_page_url,health_status,current_confidence,
  last_verified_location_at,metadata,created_at,updated_at
)
SELECT
  id,
  'target-source-' || id,
  official_url,
  official_url,
  CASE WHEN is_active=0 THEN 'disabled' WHEN consecutive_failures>0 THEN 'degraded' ELSE 'healthy' END,
  CASE WHEN last_success_at IS NULL THEN 0.75 ELSE 1.0 END,
  last_success_at,
  json_object('adapter_key',adapter_key,'parser_version',parser_version),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM icai_sources;

INSERT OR IGNORE INTO autofetch_source_locations (
  id,source_id,url,location_type,status,first_seen_at,last_seen_at,http_status,metadata
)
SELECT
  'source-location-' || lower(hex(id || '|' || official_url)),
  id,
  official_url,
  'source_page',
  'current',
  COALESCE(created_at,CURRENT_TIMESTAMP),
  COALESCE(last_success_at,last_attempt_at,created_at,CURRENT_TIMESTAMP),
  CASE WHEN last_success_at IS NULL THEN NULL ELSE 200 END,
  '{}'
FROM icai_sources;

-- Stable identity material deliberately excludes URL. A moved URL therefore maps
-- to the same canonical resource identity while the physical row/location history
-- can change underneath it.
INSERT OR IGNORE INTO autofetch_resource_records (
  resource_row_id,canonical_resource_id,source_id,target_id,identity_material,source_page_url,
  direct_file_url,direct_file_mime_type,direct_file_verified_at,health_status,is_current,
  first_seen_at,last_seen_at,created_at,updated_at
)
SELECT
  r.id,
  'icai-' || lower(hex(
    r.source_id || '|' || lower(trim(r.resource_type)) || '|' || lower(trim(r.title)) || '|' ||
    COALESCE(r.published_on,'') || '|' || COALESCE(json_extract(r.metadata,'$.level_codes'),'[]') || '|' ||
    COALESCE(json_extract(r.metadata,'$.attempt_keys'),'[]')
  )),
  r.source_id,
  'target-source-' || r.source_id,
  r.source_id || '|' || lower(trim(r.resource_type)) || '|' || lower(trim(r.title)) || '|' ||
    COALESCE(r.published_on,'') || '|' || COALESCE(json_extract(r.metadata,'$.level_codes'),'[]') || '|' ||
    COALESCE(json_extract(r.metadata,'$.attempt_keys'),'[]'),
  COALESCE(NULLIF(r.source_url,''),s.official_url),
  CASE
    WHEN lower(r.official_url) LIKE '%.pdf%' OR lower(r.official_url) LIKE '%.doc%' OR
         lower(r.official_url) LIKE '%.docx%' OR lower(r.official_url) LIKE '%.xls%' OR
         lower(r.official_url) LIKE '%.xlsx%' OR lower(r.official_url) LIKE '%.zip%' OR
         lower(r.official_url) LIKE '%resource.cdn.icai.org%'
    THEN r.official_url ELSE NULL END,
  CASE
    WHEN lower(r.official_url) LIKE '%.pdf%' THEN 'application/pdf'
    WHEN lower(r.official_url) LIKE '%.zip%' THEN 'application/zip'
    ELSE NULL END,
  CASE WHEN r.verification_status='verified' THEN r.last_seen_at ELSE NULL END,
  CASE WHEN r.status='active' AND r.verification_status='verified' THEN 'healthy' ELSE 'stale' END,
  CASE WHEN r.status='active' AND r.verification_status='verified' THEN 1 ELSE 0 END,
  r.first_seen_at,
  r.last_seen_at,
  COALESCE(r.created_at,CURRENT_TIMESTAMP),
  COALESCE(r.updated_at,CURRENT_TIMESTAMP)
FROM icai_resources r
JOIN icai_sources s ON s.id=r.source_id;

INSERT OR IGNORE INTO autofetch_resource_locations (
  id,resource_row_id,canonical_resource_id,url,location_type,status,first_seen_at,last_seen_at,metadata
)
SELECT
  'resource-source-' || lower(hex(a.canonical_resource_id || '|' || a.source_page_url)),
  a.resource_row_id,
  a.canonical_resource_id,
  a.source_page_url,
  'source_page',
  'current',
  a.first_seen_at,
  a.last_seen_at,
  '{}'
FROM autofetch_resource_records a
WHERE a.source_page_url IS NOT NULL;

INSERT OR IGNORE INTO autofetch_resource_locations (
  id,resource_row_id,canonical_resource_id,url,location_type,status,mime_type,first_seen_at,last_seen_at,metadata
)
SELECT
  'resource-file-' || lower(hex(a.canonical_resource_id || '|' || a.direct_file_url)),
  a.resource_row_id,
  a.canonical_resource_id,
  a.direct_file_url,
  'direct_file',
  CASE WHEN a.is_current=1 THEN 'current' ELSE 'previous' END,
  a.direct_file_mime_type,
  a.first_seen_at,
  a.last_seen_at,
  '{}'
FROM autofetch_resource_records a
WHERE a.direct_file_url IS NOT NULL;

INSERT OR IGNORE INTO autofetch_resource_versions (
  id,canonical_resource_id,resource_row_id,content_hash,title,source_page_url,direct_file_url,
  verification_status,captured_at,metadata
)
SELECT
  'resource-version-' || lower(hex(r.id || '|' || r.content_hash || '|' || r.official_url)),
  a.canonical_resource_id,
  r.id,
  r.content_hash,
  r.title,
  a.source_page_url,
  a.direct_file_url,
  r.verification_status,
  COALESCE(r.last_changed_at,r.updated_at,CURRENT_TIMESTAMP),
  r.metadata
FROM icai_resources r
JOIN autofetch_resource_records a ON a.resource_row_id=r.id;

CREATE TRIGGER IF NOT EXISTS autofetch_icai_source_insert
AFTER INSERT ON icai_sources
BEGIN
  INSERT OR IGNORE INTO autofetch_content_targets (
    id,organization,content_type,expected_document_types,criticality,auto_publish_policy,enabled,metadata
  ) VALUES (
    'target-source-' || NEW.id,'ICAI',NEW.source_type,NEW.resource_types,
    CASE WHEN NEW.trust_level='high_impact' THEN 'high_impact' ELSE 'routine' END,
    CASE WHEN NEW.trust_level='high_impact' THEN 'review_high_impact' ELSE 'verified_auto' END,
    NEW.is_active,json_object('legacy_source_id',NEW.id,'level_codes',json(NEW.level_codes))
  );
  INSERT OR IGNORE INTO autofetch_source_registry (
    source_id,target_id,discovery_root_url,current_source_page_url,health_status,current_confidence,metadata
  ) VALUES (
    NEW.id,'target-source-' || NEW.id,NEW.official_url,NEW.official_url,
    CASE WHEN NEW.is_active=0 THEN 'disabled' ELSE 'healthy' END,0.75,
    json_object('adapter_key',NEW.adapter_key,'parser_version',NEW.parser_version)
  );
  INSERT OR IGNORE INTO autofetch_source_locations (
    id,source_id,url,location_type,status
  ) VALUES (
    'source-location-' || lower(hex(NEW.id || '|' || NEW.official_url)),NEW.id,NEW.official_url,'source_page','current'
  );
END;

CREATE TRIGGER IF NOT EXISTS autofetch_icai_source_url_change
AFTER UPDATE OF official_url ON icai_sources
WHEN OLD.official_url <> NEW.official_url
BEGIN
  UPDATE autofetch_source_locations
     SET status='previous',last_seen_at=CURRENT_TIMESTAMP
   WHERE source_id=NEW.id AND location_type='source_page' AND status='current';
  INSERT OR IGNORE INTO autofetch_source_locations (
    id,source_id,url,location_type,status,first_seen_at,last_seen_at
  ) VALUES (
    'source-location-' || lower(hex(NEW.id || '|' || NEW.official_url)),NEW.id,NEW.official_url,'source_page','current',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  );
  UPDATE autofetch_source_registry
     SET current_source_page_url=NEW.official_url,last_verified_location_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
   WHERE source_id=NEW.id;
  UPDATE autofetch_resource_records
     SET source_page_url=NEW.official_url,updated_at=CURRENT_TIMESTAMP
   WHERE source_id=NEW.id AND source_page_url=OLD.official_url;
END;

CREATE TRIGGER IF NOT EXISTS autofetch_icai_source_health
AFTER UPDATE OF last_success_at,last_error_at,consecutive_failures,is_active ON icai_sources
BEGIN
  UPDATE autofetch_source_registry
     SET health_status=CASE
       WHEN NEW.is_active=0 THEN 'disabled'
       WHEN NEW.consecutive_failures>0 THEN 'degraded'
       ELSE 'healthy' END,
       last_verified_location_at=CASE WHEN NEW.last_success_at IS NOT NULL THEN NEW.last_success_at ELSE last_verified_location_at END,
       current_confidence=CASE WHEN NEW.consecutive_failures>0 THEN MAX(0.25,1.0-(NEW.consecutive_failures*0.15)) ELSE 1.0 END,
       updated_at=CURRENT_TIMESTAMP
   WHERE source_id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS autofetch_icai_resource_insert
AFTER INSERT ON icai_resources
BEGIN
  UPDATE autofetch_resource_records
     SET is_current=0,updated_at=CURRENT_TIMESTAMP
   WHERE canonical_resource_id=(
     'icai-' || lower(hex(
       NEW.source_id || '|' || lower(trim(NEW.resource_type)) || '|' || lower(trim(NEW.title)) || '|' ||
       COALESCE(NEW.published_on,'') || '|' || COALESCE(json_extract(NEW.metadata,'$.level_codes'),'[]') || '|' ||
       COALESCE(json_extract(NEW.metadata,'$.attempt_keys'),'[]')
     ))
   );

  UPDATE icai_resources
     SET status='removed',replaced_by_resource_id=NEW.id,last_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
   WHERE id IN (
     SELECT resource_row_id FROM autofetch_resource_records
      WHERE canonical_resource_id=(
        'icai-' || lower(hex(
          NEW.source_id || '|' || lower(trim(NEW.resource_type)) || '|' || lower(trim(NEW.title)) || '|' ||
          COALESCE(NEW.published_on,'') || '|' || COALESCE(json_extract(NEW.metadata,'$.level_codes'),'[]') || '|' ||
          COALESCE(json_extract(NEW.metadata,'$.attempt_keys'),'[]')
        ))
      ) AND resource_row_id<>NEW.id
   ) AND status='active';

  INSERT OR REPLACE INTO autofetch_resource_records (
    resource_row_id,canonical_resource_id,source_id,target_id,identity_material,source_page_url,
    direct_file_url,direct_file_mime_type,direct_file_verified_at,health_status,is_current,
    first_seen_at,last_seen_at,created_at,updated_at
  )
  SELECT
    NEW.id,
    'icai-' || lower(hex(
      NEW.source_id || '|' || lower(trim(NEW.resource_type)) || '|' || lower(trim(NEW.title)) || '|' ||
      COALESCE(NEW.published_on,'') || '|' || COALESCE(json_extract(NEW.metadata,'$.level_codes'),'[]') || '|' ||
      COALESCE(json_extract(NEW.metadata,'$.attempt_keys'),'[]')
    )),
    NEW.source_id,
    'target-source-' || NEW.source_id,
    NEW.source_id || '|' || lower(trim(NEW.resource_type)) || '|' || lower(trim(NEW.title)) || '|' ||
      COALESCE(NEW.published_on,'') || '|' || COALESCE(json_extract(NEW.metadata,'$.level_codes'),'[]') || '|' ||
      COALESCE(json_extract(NEW.metadata,'$.attempt_keys'),'[]'),
    COALESCE(NULLIF(NEW.source_url,''),s.official_url),
    CASE
      WHEN lower(NEW.official_url) LIKE '%.pdf%' OR lower(NEW.official_url) LIKE '%.doc%' OR
           lower(NEW.official_url) LIKE '%.docx%' OR lower(NEW.official_url) LIKE '%.xls%' OR
           lower(NEW.official_url) LIKE '%.xlsx%' OR lower(NEW.official_url) LIKE '%.zip%' OR
           lower(NEW.official_url) LIKE '%resource.cdn.icai.org%'
      THEN NEW.official_url ELSE NULL END,
    CASE WHEN lower(NEW.official_url) LIKE '%.pdf%' THEN 'application/pdf'
         WHEN lower(NEW.official_url) LIKE '%.zip%' THEN 'application/zip' ELSE NULL END,
    CASE WHEN NEW.verification_status='verified' THEN NEW.last_seen_at ELSE NULL END,
    CASE WHEN NEW.status='active' AND NEW.verification_status='verified' THEN 'healthy' ELSE 'stale' END,
    CASE WHEN NEW.status='active' AND NEW.verification_status='verified' THEN 1 ELSE 0 END,
    NEW.first_seen_at,NEW.last_seen_at,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  FROM icai_sources s WHERE s.id=NEW.source_id;

  INSERT OR IGNORE INTO autofetch_resource_locations (
    id,resource_row_id,canonical_resource_id,url,location_type,status,first_seen_at,last_seen_at
  )
  SELECT
    'resource-source-' || lower(hex(a.canonical_resource_id || '|' || a.source_page_url)),
    a.resource_row_id,a.canonical_resource_id,a.source_page_url,'source_page','current',a.first_seen_at,a.last_seen_at
  FROM autofetch_resource_records a WHERE a.resource_row_id=NEW.id AND a.source_page_url IS NOT NULL;

  INSERT OR IGNORE INTO autofetch_resource_locations (
    id,resource_row_id,canonical_resource_id,url,location_type,status,mime_type,first_seen_at,last_seen_at
  )
  SELECT
    'resource-file-' || lower(hex(a.canonical_resource_id || '|' || a.direct_file_url)),
    a.resource_row_id,a.canonical_resource_id,a.direct_file_url,'direct_file','current',a.direct_file_mime_type,a.first_seen_at,a.last_seen_at
  FROM autofetch_resource_records a WHERE a.resource_row_id=NEW.id AND a.direct_file_url IS NOT NULL;

  INSERT OR IGNORE INTO autofetch_resource_versions (
    id,canonical_resource_id,resource_row_id,content_hash,title,source_page_url,direct_file_url,verification_status,captured_at,metadata
  )
  SELECT
    'resource-version-' || lower(hex(NEW.id || '|' || NEW.content_hash || '|' || NEW.official_url)),
    a.canonical_resource_id,NEW.id,NEW.content_hash,NEW.title,a.source_page_url,a.direct_file_url,NEW.verification_status,CURRENT_TIMESTAMP,NEW.metadata
  FROM autofetch_resource_records a WHERE a.resource_row_id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS autofetch_icai_resource_update
AFTER UPDATE OF official_url,title,summary,published_on,content_hash,verification_status,metadata,source_snapshot_id ON icai_resources
BEGIN
  UPDATE autofetch_resource_records
     SET source_page_url=COALESCE(NULLIF(NEW.source_url,''),(SELECT official_url FROM icai_sources WHERE id=NEW.source_id)),
         direct_file_url=CASE
           WHEN lower(NEW.official_url) LIKE '%.pdf%' OR lower(NEW.official_url) LIKE '%.doc%' OR
                lower(NEW.official_url) LIKE '%.docx%' OR lower(NEW.official_url) LIKE '%.xls%' OR
                lower(NEW.official_url) LIKE '%.xlsx%' OR lower(NEW.official_url) LIKE '%.zip%' OR
                lower(NEW.official_url) LIKE '%resource.cdn.icai.org%'
           THEN NEW.official_url ELSE direct_file_url END,
         direct_file_mime_type=CASE WHEN lower(NEW.official_url) LIKE '%.pdf%' THEN 'application/pdf'
                                    WHEN lower(NEW.official_url) LIKE '%.zip%' THEN 'application/zip'
                                    ELSE direct_file_mime_type END,
         direct_file_verified_at=CASE WHEN NEW.verification_status='verified' THEN NEW.last_seen_at ELSE direct_file_verified_at END,
         health_status=CASE WHEN NEW.status='active' AND NEW.verification_status='verified' THEN 'healthy' ELSE 'stale' END,
         is_current=CASE WHEN NEW.status='active' AND NEW.verification_status='verified' THEN 1 ELSE 0 END,
         last_seen_at=NEW.last_seen_at,
         updated_at=CURRENT_TIMESTAMP
   WHERE resource_row_id=NEW.id;

  UPDATE autofetch_resource_locations
     SET status='previous',last_seen_at=CURRENT_TIMESTAMP
   WHERE canonical_resource_id=(SELECT canonical_resource_id FROM autofetch_resource_records WHERE resource_row_id=NEW.id)
     AND location_type='direct_file' AND status='current' AND url<>NEW.official_url;

  INSERT OR IGNORE INTO autofetch_resource_locations (
    id,resource_row_id,canonical_resource_id,url,location_type,status,mime_type,first_seen_at,last_seen_at
  )
  SELECT
    'resource-file-' || lower(hex(a.canonical_resource_id || '|' || a.direct_file_url)),
    a.resource_row_id,a.canonical_resource_id,a.direct_file_url,'direct_file','current',a.direct_file_mime_type,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
  FROM autofetch_resource_records a WHERE a.resource_row_id=NEW.id AND a.direct_file_url IS NOT NULL;

  INSERT OR IGNORE INTO autofetch_resource_versions (
    id,canonical_resource_id,resource_row_id,content_hash,title,source_page_url,direct_file_url,verification_status,captured_at,metadata
  )
  SELECT
    'resource-version-' || lower(hex(NEW.id || '|' || NEW.content_hash || '|' || NEW.official_url)),
    a.canonical_resource_id,NEW.id,NEW.content_hash,NEW.title,a.source_page_url,a.direct_file_url,NEW.verification_status,CURRENT_TIMESTAMP,NEW.metadata
  FROM autofetch_resource_records a WHERE a.resource_row_id=NEW.id;
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0012','product phase0 autofetch source identity and direct-document contracts','8a5a82a752a2621fd433b634e619dd28859d9e83');
