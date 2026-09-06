import "server-only";

import { getHotD1Database, type HotD1Database } from "@/lib/data/d1/runtime";
import { fetchOwnedProgressData } from "./progress-data.mjs";
import { buildProgressPdf } from "./progress-pdf.mjs";

export async function getOwnedProgressExportData(userId: string, db: HotD1Database = getHotD1Database()) {
  return fetchOwnedProgressData(db, userId);
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
