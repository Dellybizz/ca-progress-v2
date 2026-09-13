PRAGMA foreign_key_check;

SELECT 'chapter_without_valid_module' AS finding,c.id AS entity_id
FROM chapters c LEFT JOIN academic_modules m ON m.id=c.module_id AND m.syllabus_version_id=c.syllabus_version_id
WHERE m.id IS NULL;

SELECT 'invalid_attempt_syllabus_scope' AS finding,asm.id AS entity_id
FROM attempt_syllabus_map asm
LEFT JOIN exam_attempts a ON a.level_id=asm.level_id AND a.attempt_key=asm.attempt_key
LEFT JOIN course_groups g ON g.id=asm.group_id AND g.level_id=asm.level_id
LEFT JOIN subjects s ON s.id=asm.subject_id AND s.level_id=asm.level_id AND s.group_id=asm.group_id
LEFT JOIN syllabus_versions sv ON sv.id=asm.syllabus_version_id AND sv.subject_id=asm.subject_id
WHERE a.id IS NULL OR g.id IS NULL OR s.id IS NULL OR sv.id IS NULL;

SELECT 'invalid_syllabus_effective_range' AS finding,id AS entity_id
FROM syllabus_versions WHERE effective_to IS NOT NULL AND effective_to<effective_from;

SELECT 'student_visible_resource_without_mapping_or_quarantine' AS finding,ir.id AS entity_id
FROM icai_resources ir
WHERE ir.verification_status='verified'
AND NOT EXISTS(SELECT 1 FROM academic_content_mappings m WHERE m.entity_type='icai_resource' AND m.entity_id=ir.id)
AND NOT EXISTS(SELECT 1 FROM academic_mapping_quarantine q WHERE q.entity_type='icai_resource' AND q.entity_id=ir.id AND q.status='pending');

SELECT 'published_upload_without_mapping_or_quarantine' AS finding,ur.id AS entity_id
FROM uploaded_resources ur
WHERE ur.published_at IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM academic_content_mappings m WHERE m.entity_type='resource' AND m.entity_id=ur.id)
AND NOT EXISTS(SELECT 1 FROM academic_mapping_quarantine q WHERE q.entity_type='resource' AND q.entity_id=ur.id AND q.status='pending');

SELECT 'invalid_canonical_mapping' AS finding,m.id AS entity_id
FROM academic_content_mappings m
LEFT JOIN subjects s ON s.id=m.subject_id AND s.level_id=m.level_id
LEFT JOIN course_groups g ON g.id=s.group_id AND g.level_id=m.level_id
LEFT JOIN syllabus_versions sv ON sv.id=m.syllabus_version_id AND sv.subject_id=s.id
LEFT JOIN academic_modules am ON am.id=m.module_id AND am.syllabus_version_id=sv.id
LEFT JOIN chapters c ON c.id=m.chapter_id AND c.syllabus_version_id=sv.id AND (m.module_id IS NULL OR c.module_id=m.module_id)
WHERE m.mapping_status='mapped' AND (
  s.id IS NULL OR g.id IS NULL OR (m.group_id IS NOT NULL AND m.group_id<>s.group_id)
  OR (m.syllabus_version_id IS NOT NULL AND sv.id IS NULL)
  OR (m.module_id IS NOT NULL AND am.id IS NULL)
  OR (m.chapter_id IS NOT NULL AND c.id IS NULL)
);
