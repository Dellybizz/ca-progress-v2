-- Product Consistency Programme Phase 1: one canonical academic hierarchy.
-- Additive only: existing IDs and user relationships are retained.

CREATE TABLE IF NOT EXISTS academic_modules (
  id TEXT PRIMARY KEY,
  syllabus_version_id TEXT NOT NULL REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  stable_key TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(syllabus_version_id, stable_key)
);

INSERT OR IGNORE INTO academic_modules(id,syllabus_version_id,stable_key,title,sort_order)
SELECT 'module:' || id || ':default', id, 'default', 'Study material', 0 FROM syllabus_versions;

ALTER TABLE chapters ADD COLUMN module_id TEXT REFERENCES academic_modules(id) ON DELETE RESTRICT;
UPDATE chapters
SET module_id='module:' || syllabus_version_id || ':default'
WHERE module_id IS NULL;
CREATE INDEX IF NOT EXISTS chapters_module_order_idx ON chapters(module_id,sort_order);

CREATE TABLE IF NOT EXISTS academic_content_mappings (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'resource','icai_resource','test','progress','plan','notification','community','study','note'
  )),
  entity_id TEXT NOT NULL,
  level_id TEXT NOT NULL REFERENCES course_levels(id) ON DELETE RESTRICT,
  attempt_id TEXT REFERENCES exam_attempts(id) ON DELETE RESTRICT,
  group_id TEXT REFERENCES course_groups(id) ON DELETE RESTRICT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE RESTRICT,
  syllabus_version_id TEXT REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  module_id TEXT REFERENCES academic_modules(id) ON DELETE RESTRICT,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  mapping_status TEXT NOT NULL CHECK(mapping_status IN ('mapped','historical','quarantined')),
  mapping_method TEXT NOT NULL CHECK(mapping_method IN ('foreign_key','legacy_alias','official_sync','admin_resolution')),
  evidence TEXT NOT NULL DEFAULT '{}',
  resolved_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type,entity_id),
  CHECK(json_valid(evidence)),
  CHECK(mapping_status!='mapped' OR subject_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS academic_mapping_quarantine (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK(reason_code IN (
    'missing_scope','ambiguous_scope','invalid_level_group','invalid_attempt','invalid_subject_version','duplicate_candidate'
  )),
  summary TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
  resolution_mapping_id TEXT REFERENCES academic_content_mappings(id) ON DELETE SET NULL,
  resolved_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type,entity_id,reason_code),
  CHECK(json_valid(evidence)),
  CHECK((status='pending' AND resolved_at IS NULL) OR status!='pending')
);

CREATE TABLE IF NOT EXISTS academic_legacy_identities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('level','group','subject','syllabus','module','chapter')),
  legacy_system TEXT NOT NULL,
  legacy_id TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK(confidence IN ('exact','reviewed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type,legacy_system,legacy_id)
);

CREATE TABLE IF NOT EXISTS academic_duplicate_candidates (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_id TEXT NOT NULL,
  possible_duplicate_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','confirmed','not_duplicate')),
  reviewed_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type,canonical_id,possible_duplicate_id),
  CHECK(canonical_id<>possible_duplicate_id),
  CHECK(json_valid(evidence))
);

-- Preserve every existing stable identifier as an exact compatibility alias.
INSERT OR IGNORE INTO academic_legacy_identities(id,entity_type,legacy_system,legacy_id,canonical_id,confidence)
SELECT 'legacy:level:'||id,'level','pre_consistency_v1',id,id,'exact' FROM course_levels;
INSERT OR IGNORE INTO academic_legacy_identities(id,entity_type,legacy_system,legacy_id,canonical_id,confidence)
SELECT 'legacy:group:'||id,'group','pre_consistency_v1',id,id,'exact' FROM course_groups;
INSERT OR IGNORE INTO academic_legacy_identities(id,entity_type,legacy_system,legacy_id,canonical_id,confidence)
SELECT 'legacy:subject:'||id,'subject','pre_consistency_v1',id,id,'exact' FROM subjects;
INSERT OR IGNORE INTO academic_legacy_identities(id,entity_type,legacy_system,legacy_id,canonical_id,confidence)
SELECT 'legacy:syllabus:'||id,'syllabus','pre_consistency_v1',id,id,'exact' FROM syllabus_versions;
INSERT OR IGNORE INTO academic_legacy_identities(id,entity_type,legacy_system,legacy_id,canonical_id,confidence)
SELECT 'legacy:chapter:'||id,'chapter','pre_consistency_v1',id,id,'exact' FROM chapters;

-- Map existing chapter-linked records without rewriting their source rows.
INSERT OR IGNORE INTO academic_content_mappings(
  id,entity_type,entity_id,level_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id,mapping_status,mapping_method,evidence
)
SELECT 'map:progress:'||cp.user_id||':'||cp.chapter_id,'progress',cp.user_id||':'||cp.chapter_id,
       s.level_id,s.group_id,s.id,sv.id,c.module_id,c.id,'mapped','foreign_key','{"source":"chapter_progress"}'
FROM chapter_progress cp JOIN chapters c ON c.id=cp.chapter_id
JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id JOIN subjects s ON s.id=sv.subject_id;

INSERT OR IGNORE INTO academic_content_mappings(
  id,entity_type,entity_id,level_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id,mapping_status,mapping_method,evidence
)
SELECT 'map:test:'||ta.id,'test',ta.id,s.level_id,s.group_id,s.id,sv.id,c.module_id,c.id,'mapped','foreign_key','{"source":"test_attempts"}'
FROM test_attempts ta JOIN chapters c ON c.id=ta.chapter_id
JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id JOIN subjects s ON s.id=sv.subject_id;

INSERT OR IGNORE INTO academic_content_mappings(
  id,entity_type,entity_id,level_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id,mapping_status,mapping_method,evidence
)
SELECT 'map:plan:'||dpi.id,'plan',dpi.id,s.level_id,s.group_id,s.id,sv.id,c.module_id,c.id,'mapped','foreign_key','{"source":"daily_plan_items"}'
FROM daily_plan_items dpi JOIN chapters c ON c.id=dpi.chapter_id
JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id JOIN subjects s ON s.id=sv.subject_id;

INSERT OR IGNORE INTO academic_content_mappings(
  id,entity_type,entity_id,level_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id,mapping_status,mapping_method,evidence
)
SELECT 'map:resource:'||ur.id,'resource',ur.id,s.level_id,s.group_id,s.id,sv.id,c.module_id,c.id,'mapped','foreign_key','{"source":"uploaded_resources"}'
FROM uploaded_resources ur JOIN chapters c ON c.id=ur.chapter_id
JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id JOIN subjects s ON s.id=sv.subject_id;

INSERT OR IGNORE INTO academic_content_mappings(
  id,entity_type,entity_id,level_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id,mapping_status,mapping_method,evidence
)
SELECT 'map:note:'||n.id,'note',n.id,s.level_id,s.group_id,s.id,sv.id,c.module_id,c.id,'mapped','foreign_key','{"source":"notes"}'
FROM notes n JOIN chapters c ON c.id=n.chapter_id
JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id JOIN subjects s ON s.id=sv.subject_id;

INSERT OR IGNORE INTO academic_content_mappings(
  id,entity_type,entity_id,level_id,group_id,subject_id,syllabus_version_id,mapping_status,mapping_method,evidence
)
SELECT 'map:icai:'||ir.id,'icai_resource',ir.id,s.level_id,s.group_id,s.id,NULL,'mapped','official_sync',
       json_object('source','icai_resource_subject_map')
FROM icai_resources ir JOIN icai_resource_subject_map rsm ON rsm.resource_id=ir.id
JOIN subjects s ON s.id=rsm.subject_id
WHERE (SELECT COUNT(*) FROM icai_resource_subject_map x WHERE x.resource_id=ir.id)=1;

INSERT OR IGNORE INTO academic_content_mappings(
  id,entity_type,entity_id,level_id,group_id,subject_id,mapping_status,mapping_method,evidence
)
SELECT 'map:resource:'||ur.id,'resource',ur.id,s.level_id,s.group_id,s.id,'mapped','foreign_key',
       json_object('source','uploaded_resources.subject_id')
FROM uploaded_resources ur JOIN subjects s ON s.id=ur.subject_id WHERE ur.chapter_id IS NULL;

INSERT OR IGNORE INTO academic_content_mappings(
  id,entity_type,entity_id,level_id,group_id,subject_id,mapping_status,mapping_method,evidence
)
SELECT 'map:note:'||n.id,'note',n.id,s.level_id,s.group_id,s.id,'mapped','foreign_key',json_object('source','notes.subject_id')
FROM notes n JOIN subjects s ON s.id=n.subject_id WHERE n.chapter_id IS NULL;

INSERT OR IGNORE INTO academic_content_mappings(
  id,entity_type,entity_id,level_id,group_id,subject_id,mapping_status,mapping_method,evidence
)
SELECT 'map:community:'||ch.id,'community',ch.id,s.level_id,s.group_id,s.id,'mapped','foreign_key',
       json_object('source','community_channels.subject_id')
FROM community_channels ch JOIN subjects s ON s.id=ch.subject_id;

INSERT OR IGNORE INTO academic_content_mappings(
  id,entity_type,entity_id,level_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id,mapping_status,mapping_method,evidence
)
SELECT 'map:notification:'||n.id,'notification',n.id,s.level_id,s.group_id,s.id,sv.id,c.module_id,c.id,'mapped','foreign_key',
       json_object('source','in_app_notifications.chapter')
FROM in_app_notifications n JOIN chapters c ON n.entity_type='chapter' AND c.id=n.entity_id
JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id JOIN subjects s ON s.id=sv.subject_id;

-- Student-visible records with no safe scope are withheld for review, never guessed.
INSERT OR IGNORE INTO academic_mapping_quarantine(id,entity_type,entity_id,reason_code,summary,evidence)
SELECT 'quarantine:icai:'||id,'icai_resource',id,'missing_scope',
       'Verified ICAI resource has no canonical subject mapping',json_object('title',title,'official_url',official_url)
FROM icai_resources ir WHERE verification_status='verified' AND NOT EXISTS(
  SELECT 1 FROM academic_content_mappings m WHERE m.entity_type='icai_resource' AND m.entity_id=ir.id
);
INSERT OR IGNORE INTO academic_mapping_quarantine(id,entity_type,entity_id,reason_code,summary,evidence)
SELECT 'quarantine:icai-ambiguous:'||ir.id,'icai_resource',ir.id,'ambiguous_scope',
       'ICAI resource is linked to more than one subject',json_object('title',ir.title,'official_url',ir.official_url)
FROM icai_resources ir WHERE (SELECT COUNT(*) FROM icai_resource_subject_map x WHERE x.resource_id=ir.id)>1;
INSERT OR IGNORE INTO academic_mapping_quarantine(id,entity_type,entity_id,reason_code,summary,evidence)
SELECT 'quarantine:resource:'||id,'resource',id,'missing_scope',
       'Published resource has no canonical academic scope',json_object('title',title)
FROM uploaded_resources WHERE published_at IS NOT NULL AND subject_id IS NULL AND chapter_id IS NULL;

-- Evidence only. No duplicate is merged or deleted automatically.
INSERT OR IGNORE INTO academic_duplicate_candidates(id,entity_type,canonical_id,possible_duplicate_id,reason,evidence)
SELECT 'duplicate:subject:'||a.id||':'||b.id,'subject',a.id,b.id,'Same normalized title within one level/group',
       json_object('title',a.title,'group_id',a.group_id)
FROM subjects a JOIN subjects b ON a.id<b.id AND a.level_id=b.level_id AND a.group_id=b.group_id
WHERE lower(trim(a.title))=lower(trim(b.title));

CREATE INDEX IF NOT EXISTS academic_mapping_scope_idx
  ON academic_content_mappings(level_id,group_id,subject_id,syllabus_version_id,mapping_status);
CREATE INDEX IF NOT EXISTS academic_quarantine_status_idx
  ON academic_mapping_quarantine(status,created_at);
CREATE INDEX IF NOT EXISTS academic_legacy_lookup_idx
  ON academic_legacy_identities(entity_type,legacy_system,legacy_id);
CREATE INDEX IF NOT EXISTS academic_duplicates_status_idx
  ON academic_duplicate_candidates(status,entity_type);

-- New writes cannot create impossible hierarchy combinations.
CREATE TRIGGER IF NOT EXISTS subjects_level_group_guard_insert
BEFORE INSERT ON subjects WHEN NOT EXISTS(
  SELECT 1 FROM course_groups g WHERE g.id=NEW.group_id AND g.level_id=NEW.level_id
) BEGIN SELECT RAISE(ABORT,'subject group must belong to subject level'); END;
CREATE TRIGGER IF NOT EXISTS subjects_level_group_guard_update
BEFORE UPDATE OF level_id,group_id ON subjects WHEN NOT EXISTS(
  SELECT 1 FROM course_groups g WHERE g.id=NEW.group_id AND g.level_id=NEW.level_id
) BEGIN SELECT RAISE(ABORT,'subject group must belong to subject level'); END;

CREATE TRIGGER IF NOT EXISTS syllabus_effective_range_guard_insert
BEFORE INSERT ON syllabus_versions WHEN NEW.effective_to IS NOT NULL AND NEW.effective_to<NEW.effective_from
BEGIN SELECT RAISE(ABORT,'syllabus effective range is invalid'); END;
CREATE TRIGGER IF NOT EXISTS syllabus_effective_range_guard_update
BEFORE UPDATE OF effective_from,effective_to ON syllabus_versions WHEN NEW.effective_to IS NOT NULL AND NEW.effective_to<NEW.effective_from
BEGIN SELECT RAISE(ABORT,'syllabus effective range is invalid'); END;

CREATE TRIGGER IF NOT EXISTS attempt_syllabus_scope_guard_insert
BEFORE INSERT ON attempt_syllabus_map WHEN NOT EXISTS(
  SELECT 1 FROM exam_attempts a JOIN subjects s ON s.id=NEW.subject_id
  JOIN course_groups g ON g.id=NEW.group_id JOIN syllabus_versions sv ON sv.id=NEW.syllabus_version_id
  WHERE a.level_id=NEW.level_id AND a.attempt_key=NEW.attempt_key
    AND s.level_id=NEW.level_id AND s.group_id=NEW.group_id AND g.level_id=NEW.level_id AND sv.subject_id=NEW.subject_id
) BEGIN SELECT RAISE(ABORT,'attempt syllabus mapping has inconsistent academic scope'); END;
CREATE TRIGGER IF NOT EXISTS attempt_syllabus_scope_guard_update
BEFORE UPDATE ON attempt_syllabus_map WHEN NOT EXISTS(
  SELECT 1 FROM exam_attempts a JOIN subjects s ON s.id=NEW.subject_id
  JOIN course_groups g ON g.id=NEW.group_id JOIN syllabus_versions sv ON sv.id=NEW.syllabus_version_id
  WHERE a.level_id=NEW.level_id AND a.attempt_key=NEW.attempt_key
    AND s.level_id=NEW.level_id AND s.group_id=NEW.group_id AND g.level_id=NEW.level_id AND sv.subject_id=NEW.subject_id
) BEGIN SELECT RAISE(ABORT,'attempt syllabus mapping has inconsistent academic scope'); END;

CREATE TRIGGER IF NOT EXISTS chapter_module_scope_guard_insert
BEFORE INSERT ON chapters WHEN NEW.module_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM academic_modules m WHERE m.id=NEW.module_id AND m.syllabus_version_id=NEW.syllabus_version_id
) BEGIN SELECT RAISE(ABORT,'chapter module must belong to chapter syllabus'); END;
CREATE TRIGGER IF NOT EXISTS chapter_module_scope_guard_update
BEFORE UPDATE OF module_id,syllabus_version_id ON chapters WHEN NEW.module_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM academic_modules m WHERE m.id=NEW.module_id AND m.syllabus_version_id=NEW.syllabus_version_id
) BEGIN SELECT RAISE(ABORT,'chapter module must belong to chapter syllabus'); END;

CREATE TRIGGER IF NOT EXISTS academic_mapping_scope_guard_insert
BEFORE INSERT ON academic_content_mappings WHEN NOT EXISTS(
  SELECT 1 FROM subjects s JOIN course_groups g ON g.id=s.group_id
  WHERE s.id=NEW.subject_id AND s.level_id=NEW.level_id AND g.level_id=NEW.level_id
    AND (NEW.group_id IS NULL OR NEW.group_id=s.group_id)
) BEGIN SELECT RAISE(ABORT,'canonical content mapping has inconsistent academic scope'); END;
CREATE TRIGGER IF NOT EXISTS academic_mapping_scope_guard_update
BEFORE UPDATE OF level_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id ON academic_content_mappings WHEN NOT EXISTS(
  SELECT 1 FROM subjects s JOIN course_groups g ON g.id=s.group_id
  WHERE s.id=NEW.subject_id AND s.level_id=NEW.level_id AND g.level_id=NEW.level_id
    AND (NEW.group_id IS NULL OR NEW.group_id=s.group_id)
) BEGIN SELECT RAISE(ABORT,'canonical content mapping has inconsistent academic scope'); END;

-- Future core writes join the same registry automatically. Unscoped public records are quarantined.
CREATE TRIGGER IF NOT EXISTS academic_map_progress_after_insert AFTER INSERT ON chapter_progress BEGIN
  INSERT OR IGNORE INTO academic_content_mappings(id,entity_type,entity_id,level_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id,mapping_status,mapping_method,evidence)
  SELECT 'map:progress:'||NEW.user_id||':'||NEW.chapter_id,'progress',NEW.user_id||':'||NEW.chapter_id,s.level_id,s.group_id,s.id,sv.id,c.module_id,c.id,'mapped','foreign_key','{"source":"chapter_progress"}'
  FROM chapters c JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id JOIN subjects s ON s.id=sv.subject_id WHERE c.id=NEW.chapter_id;
END;
CREATE TRIGGER IF NOT EXISTS academic_map_test_after_insert AFTER INSERT ON test_attempts BEGIN
  INSERT OR IGNORE INTO academic_content_mappings(id,entity_type,entity_id,level_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id,mapping_status,mapping_method,evidence)
  SELECT 'map:test:'||NEW.id,'test',NEW.id,s.level_id,s.group_id,s.id,sv.id,c.module_id,c.id,'mapped','foreign_key','{"source":"test_attempts"}'
  FROM chapters c JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id JOIN subjects s ON s.id=sv.subject_id WHERE c.id=NEW.chapter_id;
END;
CREATE TRIGGER IF NOT EXISTS academic_map_plan_after_insert AFTER INSERT ON daily_plan_items WHEN NEW.chapter_id IS NOT NULL BEGIN
  INSERT OR IGNORE INTO academic_content_mappings(id,entity_type,entity_id,level_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id,mapping_status,mapping_method,evidence)
  SELECT 'map:plan:'||NEW.id,'plan',NEW.id,s.level_id,s.group_id,s.id,sv.id,c.module_id,c.id,'mapped','foreign_key','{"source":"daily_plan_items"}'
  FROM chapters c JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id JOIN subjects s ON s.id=sv.subject_id WHERE c.id=NEW.chapter_id;
END;
CREATE TRIGGER IF NOT EXISTS academic_quarantine_public_resource_after_insert AFTER INSERT ON uploaded_resources
WHEN NEW.published_at IS NOT NULL AND NEW.subject_id IS NULL AND NEW.chapter_id IS NULL BEGIN
  INSERT OR IGNORE INTO academic_mapping_quarantine(id,entity_type,entity_id,reason_code,summary,evidence)
  VALUES('quarantine:resource:'||NEW.id,'resource',NEW.id,'missing_scope','Published resource has no canonical academic scope',json_object('title',NEW.title));
END;
CREATE TRIGGER IF NOT EXISTS academic_map_community_after_insert AFTER INSERT ON community_channels WHEN NEW.subject_id IS NOT NULL BEGIN
  INSERT OR IGNORE INTO academic_content_mappings(id,entity_type,entity_id,level_id,group_id,subject_id,mapping_status,mapping_method,evidence)
  SELECT 'map:community:'||NEW.id,'community',NEW.id,s.level_id,s.group_id,s.id,'mapped','foreign_key','{"source":"community_channels.subject_id"}'
  FROM subjects s WHERE s.id=NEW.subject_id;
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0039','product consistency phase 1 canonical academic hierarchy and quarantine','20560a8e4143bb08cdc12c51c579805b80b2df06');
