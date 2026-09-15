import "server-only";

import type { AppRole } from "@/lib/authorization/roles";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

export type AcademicQuarantineItem = {
  id: string;
  entityType: string;
  entityId: string;
  reasonCode: string;
  summary: string;
  evidence: Record<string, unknown>;
  createdAt: string;
};

export type AcademicConsistencyOverview = {
  modules: number;
  mappedItems: number;
  pendingItems: AcademicQuarantineItem[];
  openDuplicateCandidates: number;
  legacyAliases: number;
};

export type AcademicResolutionOption = {
  levelId: string; groupId: string; subjectId: string; syllabusVersionId: string;
  moduleId: string | null; chapterId: string | null; label: string;
};

function parsedEvidence(value: string) {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

export async function getAcademicConsistencyOverview(): Promise<AcademicConsistencyOverview> {
  const db = getD1RuntimeDatabase();
  const [modules, mapped, pending, duplicates, aliases] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM academic_modules").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM academic_content_mappings WHERE mapping_status='mapped'").first<{ count: number }>(),
    db.prepare(`SELECT id,entity_type,entity_id,reason_code,summary,evidence,created_at
      FROM academic_mapping_quarantine WHERE status='pending' ORDER BY created_at,id LIMIT 100`).all<{
      id: string; entity_type: string; entity_id: string; reason_code: string; summary: string; evidence: string; created_at: string;
    }>(),
    db.prepare("SELECT COUNT(*) AS count FROM academic_duplicate_candidates WHERE status='open'").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM academic_legacy_identities").first<{ count: number }>(),
  ]);
  return {
    modules: Number(modules?.count ?? 0),
    mappedItems: Number(mapped?.count ?? 0),
    pendingItems: (pending.results ?? []).map((row) => ({
      id: row.id, entityType: row.entity_type, entityId: row.entity_id, reasonCode: row.reason_code,
      summary: row.summary, evidence: parsedEvidence(row.evidence), createdAt: row.created_at,
    })),
    openDuplicateCandidates: Number(duplicates?.count ?? 0),
    legacyAliases: Number(aliases?.count ?? 0),
  };
}

export async function getAcademicResolutionOptions(): Promise<AcademicResolutionOption[]> {
  const db = getD1RuntimeDatabase();
  const response = await db.prepare(`SELECT l.id AS level_id,l.name AS level_name,g.id AS group_id,g.name AS group_name,
      s.id AS subject_id,s.title AS subject_title,sv.id AS syllabus_version_id,sv.title AS syllabus_title,
      m.id AS module_id,m.title AS module_title,c.id AS chapter_id,c.chapter_number,c.title AS chapter_title
    FROM syllabus_versions sv JOIN subjects s ON s.id=sv.subject_id JOIN course_levels l ON l.id=s.level_id
    JOIN course_groups g ON g.id=s.group_id LEFT JOIN academic_modules m ON m.syllabus_version_id=sv.id AND m.is_active=1
    LEFT JOIN chapters c ON c.syllabus_version_id=sv.id AND c.module_id=m.id
    ORDER BY l.sort_order,g.sort_order,s.sort_order,m.sort_order,c.sort_order LIMIT 5000`).all<{
      level_id:string;level_name:string;group_id:string;group_name:string;subject_id:string;subject_title:string;
      syllabus_version_id:string;syllabus_title:string;module_id:string|null;module_title:string|null;
      chapter_id:string|null;chapter_number:string|null;chapter_title:string|null;
    }>();
  return (response.results ?? []).map((row) => ({
    levelId:row.level_id,groupId:row.group_id,subjectId:row.subject_id,syllabusVersionId:row.syllabus_version_id,
    moduleId:row.module_id,chapterId:row.chapter_id,
    label:[row.level_name,row.group_name,row.subject_title,row.syllabus_title,row.module_title,
      row.chapter_title ? `${row.chapter_number ?? ""} ${row.chapter_title}`.trim() : null].filter(Boolean).join(" · "),
  }));
}

type ResolutionInput = {
  quarantineId: string;
  levelId: string;
  attemptId?: string | null;
  groupId: string;
  subjectId: string;
  syllabusVersionId: string;
  moduleId?: string | null;
  chapterId?: string | null;
  reason: string;
  actorUserId: string;
  actorRole: AppRole;
};

export async function resolveAcademicQuarantine(input: ResolutionInput) {
  const db = getD1RuntimeDatabase();
  const quarantine = await db.prepare(`SELECT id,entity_type,entity_id,reason_code,summary,evidence,status
    FROM academic_mapping_quarantine WHERE id=?1 LIMIT 1`).bind(input.quarantineId).first<{
      id: string; entity_type: string; entity_id: string; reason_code: string; summary: string; evidence: string; status: string;
    }>();
  if (!quarantine || quarantine.status !== "pending") throw new Error("This quarantine item is no longer pending.");
  if (input.reason.trim().length < 8) throw new Error("Add a clear resolution reason (at least 8 characters).");

  const scope = await db.prepare(`SELECT s.id AS subject_id,s.level_id,s.group_id,sv.id AS syllabus_version_id,
      m.id AS module_id,c.id AS chapter_id
    FROM subjects s JOIN syllabus_versions sv ON sv.subject_id=s.id
    LEFT JOIN academic_modules m ON m.id=?5 AND m.syllabus_version_id=sv.id
    LEFT JOIN chapters c ON c.id=?6 AND c.syllabus_version_id=sv.id AND (m.id IS NULL OR c.module_id=m.id)
    WHERE s.id=?1 AND s.level_id=?2 AND s.group_id=?3 AND sv.id=?4 LIMIT 1`)
    .bind(input.subjectId,input.levelId,input.groupId,input.syllabusVersionId,input.moduleId ?? null,input.chapterId ?? null)
    .first<{ subject_id: string; level_id: string; group_id: string; syllabus_version_id: string; module_id: string | null; chapter_id: string | null }>();
  if (!scope || (input.moduleId && !scope.module_id) || (input.chapterId && !scope.chapter_id)) {
    throw new Error("The selected level, group, subject, syllabus, module and chapter do not form one valid hierarchy.");
  }
  if (input.attemptId) {
    const attempt = await db.prepare(`SELECT 1 AS ok FROM exam_attempts a JOIN attempt_syllabus_map asm
      ON asm.level_id=a.level_id AND asm.attempt_key=a.attempt_key
      WHERE a.id=?1 AND a.level_id=?2 AND asm.group_id=?3 AND asm.subject_id=?4 AND asm.syllabus_version_id=?5 LIMIT 1`)
      .bind(input.attemptId,input.levelId,input.groupId,input.subjectId,input.syllabusVersionId).first();
    if (!attempt) throw new Error("The selected attempt is not valid for this syllabus mapping.");
  }

  const now = new Date().toISOString();
  const mappingId = `map:${quarantine.entity_type}:${quarantine.entity_id}`;
  const auditId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO academic_content_mappings(
      id,entity_type,entity_id,level_id,attempt_id,group_id,subject_id,syllabus_version_id,module_id,chapter_id,
      mapping_status,mapping_method,evidence,resolved_by,resolved_at,updated_at
    ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'mapped','admin_resolution',?11,?12,?13,?13)
    ON CONFLICT(entity_type,entity_id) DO UPDATE SET level_id=excluded.level_id,attempt_id=excluded.attempt_id,
      group_id=excluded.group_id,subject_id=excluded.subject_id,syllabus_version_id=excluded.syllabus_version_id,
      module_id=excluded.module_id,chapter_id=excluded.chapter_id,mapping_status='mapped',mapping_method='admin_resolution',
      evidence=excluded.evidence,resolved_by=excluded.resolved_by,resolved_at=excluded.resolved_at,updated_at=excluded.updated_at`)
      .bind(mappingId,quarantine.entity_type,quarantine.entity_id,input.levelId,input.attemptId ?? null,input.groupId,
        input.subjectId,input.syllabusVersionId,input.moduleId ?? null,input.chapterId ?? null,
        JSON.stringify({ quarantineId: quarantine.id, reason: input.reason.trim() }),input.actorUserId,now),
    db.prepare(`UPDATE academic_mapping_quarantine SET status='resolved',resolution_mapping_id=?1,resolved_by=?2,
      resolved_at=?3,updated_at=?3 WHERE id=?4 AND status='pending'`).bind(mappingId,input.actorUserId,now,quarantine.id),
    db.prepare(`INSERT INTO admin_audit_events(id,actor_user_id,actor_role,capability,action,target_type,target_id,
      reason,previous_value,new_value,trace_id,reversible,created_at)
      VALUES(?1,?2,?3,'academic.edit','academic.quarantine.resolve','academic_mapping_quarantine',?4,?5,?6,?7,?8,0,?9)`)
      .bind(auditId,input.actorUserId,input.actorRole,quarantine.id,input.reason.trim(),JSON.stringify(quarantine),
        JSON.stringify({ mappingId,levelId:input.levelId,groupId:input.groupId,subjectId:input.subjectId,
          syllabusVersionId:input.syllabusVersionId,moduleId:input.moduleId ?? null,chapterId:input.chapterId ?? null }),
        crypto.randomUUID(),now),
  ]);
  return mappingId;
}

export async function dismissAcademicQuarantine(input: { quarantineId: string; reason: string; actorUserId: string; actorRole: AppRole }) {
  if (input.reason.trim().length < 8) throw new Error("Add a clear dismissal reason (at least 8 characters).");
  const db = getD1RuntimeDatabase();
  const now = new Date().toISOString();
  const current = await db.prepare("SELECT * FROM academic_mapping_quarantine WHERE id=?1 AND status='pending'")
    .bind(input.quarantineId).first<Record<string, unknown>>();
  if (!current) throw new Error("This quarantine item is no longer pending.");
  await db.batch([
    db.prepare(`UPDATE academic_mapping_quarantine SET status='dismissed',resolved_by=?1,resolved_at=?2,updated_at=?2
      WHERE id=?3 AND status='pending'`).bind(input.actorUserId,now,input.quarantineId),
    db.prepare(`INSERT INTO admin_audit_events(id,actor_user_id,actor_role,capability,action,target_type,target_id,
      reason,previous_value,new_value,trace_id,reversible,created_at)
      VALUES(?1,?2,?3,'academic.edit','academic.quarantine.dismiss','academic_mapping_quarantine',?4,?5,?6,?7,?8,0,?9)`)
      .bind(crypto.randomUUID(),input.actorUserId,input.actorRole,input.quarantineId,input.reason.trim(),
        JSON.stringify(current),JSON.stringify({ status:"dismissed" }),crypto.randomUUID(),now),
  ]);
}
