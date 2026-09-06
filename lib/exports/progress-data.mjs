export const OWNED_PROGRESS_PROFILE_SQL = "SELECT display_name,ca_level,group_choice,attempt_key FROM profiles WHERE user_id=?1 LIMIT 1";

export const OWNED_PROGRESS_ROWS_SQL = `
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
`;

export async function fetchOwnedProgressData(db, userId) {
  if (!userId || typeof userId !== "string") throw new Error("Authenticated user id is required for progress export.");
  const profilePromise = db.prepare(OWNED_PROGRESS_PROFILE_SQL).bind(userId).first();
  const progressPromise = db.prepare(OWNED_PROGRESS_ROWS_SQL).bind(userId).all();
  const [profile, progressResult] = await Promise.all([profilePromise, progressPromise]);
  return { profile: profile ?? null, rows: progressResult?.results ?? [] };
}
