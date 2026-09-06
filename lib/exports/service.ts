import "server-only";

import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";
import { buildProgressPdf } from "./progress-pdf.mjs";

export type ProgressExportProfile = {
  display_name: string | null;
  ca_level: string | null;
  group_choice: string | null;
  attempt_key: string | null;
};

export type ProgressExportRow = {
  chapter_id: string;
  chapter_number: string;
  chapter_title: string;
  subject_title: string;
  level_title: string;
  completed_at: string | null;
  revision_1_at: string | null;
  revision_2_at: string | null;
  test_1_at: string | null;
  test_2_at: string | null;
};

export async function getOwnedProgressExportData(userId: string, db: HotD1Database = getHotD1Database()) {
  const profilePromise = db.prepare(
    "SELECT display_name,ca_level,group_choice,attempt_key FROM profiles WHERE user_id=?1 LIMIT 1",
  ).bind(userId).first<ProgressExportProfile>();

  const progressPromise = db.prepare(`
    SELECT
      cp.chapter_id,
      c.chapter_number,
      c.title AS chapter_title,
      s.title AS subject_title,
      cl.name AS level_title,
      cp.completed_at,
      cp.revision_1_at,
      cp.revision_2_at,
      cp.test_1_at,
      cp.test_2_at
    FROM chapter_progress cp
    JOIN chapters c ON c.id=cp.chapter_id
    JOIN syllabus_versions sv ON sv.id=c.syllabus_version_id
    JOIN subjects s ON s.id=sv.subject_id
    JOIN course_levels cl ON cl.id=s.level_id
    WHERE cp.user_id=?1
    ORDER BY cl.sort_order ASC, cl.id ASC, s.sort_order ASC, s.id ASC, c.sort_order ASC, c.id ASC
  `).bind(userId).all<ProgressExportRow>();

  const [profile, progressResult] = await Promise.all([profilePromise, progressPromise]);
  return { profile, rows: progressResult.results ?? [] };
}

export async function createOwnedProgressPdf(userId: string, db: HotD1Database = getHotD1Database()) {
  const data = await getOwnedProgressExportData(userId, db);
  return buildProgressPdf({
    profile: data.profile ? {
      displayName: data.profile.display_name,
      caLevel: data.profile.ca_level,
      groupChoice: data.profile.group_choice,
      attemptKey: data.profile.attempt_key,
    } : null,
    rows: data.rows.map((row) => ({
      chapterId: row.chapter_id,
      chapterNumber: row.chapter_number,
      chapterTitle: row.chapter_title,
      subjectTitle: row.subject_title,
      levelTitle: row.level_title,
      completedAt: row.completed_at,
      revision1At: row.revision_1_at,
      revision2At: row.revision_2_at,
      test1At: row.test_1_at,
      test2At: row.test_2_at,
    })),
  });
}
