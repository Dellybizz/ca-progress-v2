-- Product Consistency Programme Phase 0: strictly read-only diagnostics.
PRAGMA foreign_key_check;

SELECT 'subject_group_level_mismatch' AS finding, 'critical' AS severity, s.id AS entity_id, s.title AS detail
FROM subjects s JOIN course_groups g ON g.id = s.group_id
WHERE s.level_id <> g.level_id;

SELECT 'attempt_scope_mismatch' AS finding, 'critical' AS severity, CAST(asm.id AS TEXT) AS entity_id,
       asm.attempt_key || ' / ' || asm.subject_id AS detail
FROM attempt_syllabus_map asm
JOIN exam_attempts ea ON ea.level_id = asm.level_id AND ea.attempt_key = asm.attempt_key
JOIN course_groups g ON g.id = asm.group_id
JOIN subjects s ON s.id = asm.subject_id
JOIN syllabus_versions sv ON sv.id = asm.syllabus_version_id
WHERE g.level_id <> asm.level_id OR s.level_id <> asm.level_id OR s.group_id <> asm.group_id OR sv.subject_id <> asm.subject_id;

SELECT 'overlapping_published_syllabus' AS finding, 'high' AS severity, a.id AS entity_id,
       a.subject_id || ' overlaps ' || b.id AS detail
FROM syllabus_versions a JOIN syllabus_versions b ON b.subject_id = a.subject_id AND b.id > a.id
WHERE a.status = 'published' AND b.status = 'published'
  AND COALESCE(a.effective_to, '9999-12-31') >= b.effective_from
  AND COALESCE(b.effective_to, '9999-12-31') >= a.effective_from;

SELECT 'current_subject_without_attempt_map' AS finding, 'high' AS severity, s.id AS entity_id, s.title AS detail
FROM subjects s
WHERE s.is_active = 1 AND NOT EXISTS (SELECT 1 FROM attempt_syllabus_map asm WHERE asm.subject_id = s.id);

SELECT 'verified_icai_resource_without_scope' AS finding, 'high' AS severity, r.id AS entity_id, r.title AS detail
FROM icai_resources r
WHERE r.status = 'active' AND r.verification_status = 'verified'
  AND NOT EXISTS (SELECT 1 FROM icai_resource_subject_map sm WHERE sm.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM icai_resource_attempt_map am WHERE am.resource_id = r.id);

SELECT 'resource_subject_level_mismatch' AS finding, 'critical' AS severity, sm.resource_id AS entity_id,
       sm.subject_id || ' / ' || ea.attempt_key AS detail
FROM icai_resource_subject_map sm
JOIN subjects s ON s.id = sm.subject_id
JOIN icai_resource_attempt_map am ON am.resource_id = sm.resource_id
JOIN exam_attempts ea ON ea.id = am.attempt_id
WHERE s.level_id <> ea.level_id;

SELECT 'invalid_exam_date_range' AS finding, 'critical' AS severity, id AS entity_id,
       COALESCE(start_date, 'missing') || ' → ' || COALESCE(end_date, 'missing') AS detail
FROM exam_attempts WHERE start_date IS NOT NULL AND end_date IS NOT NULL AND end_date < start_date;

SELECT 'approved_exam_without_start_date' AS finding, 'high' AS severity, id AS entity_id, label AS detail
FROM exam_attempts
WHERE verification_status = 'verified' AND status IN ('scheduled', 'open') AND start_date IS NULL;

