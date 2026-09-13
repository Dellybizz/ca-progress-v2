import { encodeCsvRow } from "./csv.mjs";

export const STUDY_EXPORT_BATCH_SIZE = 500;
export const STUDY_EXPORT_MAX_BATCH_SIZE = 1000;

export const STUDY_CSV_COLUMNS = Object.freeze([
  "session_id",
  "started_at",
  "ended_at",
  "duration_seconds",
  "mode",
  "timezone",
  "subject_id",
  "subject_title",
  "chapter_id",
  "chapter_title",
  "focus_target_seconds",
  "break_target_seconds",
  "task_id",
  "plan_item_id",
  "intended_task_title",
  "pause_count",
  "paused_seconds",
  "completion_state",
  "understanding_score",
  "focus_rating",
  "reflection_saved_at",
  "created_at",
]);

const STUDY_EXPORT_SELECT = `SELECT
  s.id AS session_id,
  s.started_at,
  s.ended_at,
  s.duration_seconds,
  s.mode,
  s.timezone,
  s.subject_id,
  sub.title AS subject_title,
  s.chapter_id,
  c.title AS chapter_title,
  s.focus_target_seconds,
  s.break_target_seconds,
  x.task_id,
  x.plan_item_id,
  COALESCE(t.title,dpi.title) AS intended_task_title,
  COALESCE(x.pause_count,0) AS pause_count,
  COALESCE(x.paused_seconds,0) AS paused_seconds,
  COALESCE(x.completion_state,'completed') AS completion_state,
  x.understanding_score,
  x.focus_rating,
  x.reflection_saved_at,
  s.created_at
FROM study_sessions s
LEFT JOIN subjects sub ON sub.id=s.subject_id
LEFT JOIN chapters c ON c.id=s.chapter_id
LEFT JOIN study_session_phase3 x ON x.session_id=s.id AND x.user_id=s.user_id
LEFT JOIN tasks t ON t.id=x.task_id AND t.user_id=s.user_id
LEFT JOIN daily_plan_items dpi ON dpi.id=x.plan_item_id AND dpi.user_id=s.user_id`;

export const OWNED_STUDY_FIRST_PAGE_SQL = `${STUDY_EXPORT_SELECT}
WHERE s.user_id=?1
ORDER BY s.started_at ASC,s.id ASC
LIMIT ?2`;

export const OWNED_STUDY_NEXT_PAGE_SQL = `${STUDY_EXPORT_SELECT}
WHERE s.user_id=?1
  AND (s.started_at>?2 OR (s.started_at=?2 AND s.id>?3))
ORDER BY s.started_at ASC,s.id ASC
LIMIT ?4`;

function assertAuthenticatedUserId(userId) {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("Authenticated user id is required for exports.");
  }
}

function normalizeBatchSize(batchSize) {
  const value = Number.isFinite(batchSize) ? Math.trunc(batchSize) : STUDY_EXPORT_BATCH_SIZE;
  return Math.min(STUDY_EXPORT_MAX_BATCH_SIZE, Math.max(1, value));
}

export async function fetchOwnedStudySessionPage(db, userId, options = {}) {
  assertAuthenticatedUserId(userId);
  const batchSize = normalizeBatchSize(options.batchSize);
  const cursor = options.cursor ?? null;
  const result = cursor
    ? await db.prepare(OWNED_STUDY_NEXT_PAGE_SQL).bind(userId, cursor.startedAt, cursor.id, batchSize).all()
    : await db.prepare(OWNED_STUDY_FIRST_PAGE_SQL).bind(userId, batchSize).all();
  const rows = result.results ?? [];
  const last = rows.at(-1);
  return {
    rows,
    nextCursor: rows.length === batchSize && last
      ? { startedAt: last.started_at, id: last.session_id }
      : null,
  };
}

export async function* iterateOwnedStudySessionPages(db, userId, options = {}) {
  assertAuthenticatedUserId(userId);
  let cursor = null;
  for (;;) {
    const page = await fetchOwnedStudySessionPage(db, userId, { ...options, cursor });
    yield page.rows;
    if (!page.nextCursor) return;
    if (cursor && cursor.startedAt === page.nextCursor.startedAt && cursor.id === page.nextCursor.id) {
      throw new Error("Study export pagination cursor did not advance.");
    }
    cursor = page.nextCursor;
  }
}

export async function* generateOwnedStudyCsvChunks(db, userId, options = {}) {
  assertAuthenticatedUserId(userId);
  yield `${encodeCsvRow(STUDY_CSV_COLUMNS)}\r\n`;
  for await (const rows of iterateOwnedStudySessionPages(db, userId, options)) {
    if (!rows.length) continue;
    const lines = rows.map((row) => encodeCsvRow(STUDY_CSV_COLUMNS.map((column) => row[column])));
    yield `${lines.join("\r\n")}\r\n`;
  }
}
