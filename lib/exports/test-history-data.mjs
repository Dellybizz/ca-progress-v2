import { encodeCsvRow } from "./csv.mjs";

export const TEST_HISTORY_EXPORT_BATCH_SIZE = 250;
export const TEST_HISTORY_EXPORT_MAX_BATCH_SIZE = 500;

export const TEST_HISTORY_CSV_COLUMNS = Object.freeze([
  "attempt_id",
  "subject_id",
  "subject_title",
  "chapter_id",
  "chapter_number",
  "chapter_title",
  "test_stage",
  "attempt_number",
  "marks_scored",
  "marks_total",
  "percentage",
  "duration_minutes",
  "completed_at",
  "mistake_count",
  "mistake_categories",
  "mistake_notes",
  "attachment_count",
  "attachment_kinds",
  "attachment_filenames",
  "created_at",
]);

const TEST_HISTORY_SELECT = `SELECT
  a.id AS attempt_id,
  a.subject_id,
  s.title AS subject_title,
  a.chapter_id,
  c.chapter_number,
  c.title AS chapter_title,
  a.test_stage,
  a.attempt_number,
  a.marks_scored,
  a.marks_total,
  a.percentage,
  a.duration_minutes,
  a.completed_at,
  a.created_at
FROM test_attempts a
JOIN subjects s ON s.id=a.subject_id
JOIN chapters c ON c.id=a.chapter_id`;

export const OWNED_TEST_HISTORY_FIRST_PAGE_SQL = `${TEST_HISTORY_SELECT}
WHERE a.user_id=?1
ORDER BY a.completed_at ASC,a.id ASC
LIMIT ?2`;

export const OWNED_TEST_HISTORY_NEXT_PAGE_SQL = `${TEST_HISTORY_SELECT}
WHERE a.user_id=?1
  AND (a.completed_at>?2 OR (a.completed_at=?2 AND a.id>?3))
ORDER BY a.completed_at ASC,a.id ASC
LIMIT ?4`;

function assertAuthenticatedUserId(userId) {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("Authenticated user id is required for exports.");
  }
}

function normalizeBatchSize(batchSize) {
  const value = Number.isFinite(batchSize) ? Math.trunc(batchSize) : TEST_HISTORY_EXPORT_BATCH_SIZE;
  return Math.min(TEST_HISTORY_EXPORT_MAX_BATCH_SIZE, Math.max(1, value));
}

function assertAttemptCount(attemptCount) {
  if (!Number.isInteger(attemptCount) || attemptCount < 1 || attemptCount > TEST_HISTORY_EXPORT_MAX_BATCH_SIZE) {
    throw new Error("Test export detail query exceeds the bounded page size.");
  }
}

function attemptPlaceholders(attemptCount) {
  assertAttemptCount(attemptCount);
  return Array.from({ length: attemptCount }, (_, index) => `?${index + 2}`).join(",");
}

export function buildOwnedTestMistakesSql(attemptCount) {
  return `SELECT id,attempt_id,category,note,created_at
FROM test_attempt_mistakes
WHERE user_id=?1 AND attempt_id IN (${attemptPlaceholders(attemptCount)})
ORDER BY attempt_id ASC,created_at ASC,id ASC`;
}

export function buildOwnedTestAttachmentsSql(attemptCount) {
  return `SELECT id,attempt_id,attachment_kind,filename,mime_type,size_bytes,created_at
FROM test_attempt_attachments
WHERE user_id=?1 AND attempt_id IN (${attemptPlaceholders(attemptCount)})
ORDER BY attempt_id ASC,created_at ASC,id ASC`;
}

function groupByAttempt(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const current = grouped.get(row.attempt_id) ?? [];
    current.push(row);
    grouped.set(row.attempt_id, current);
  }
  return grouped;
}

function enrichAttemptRows(rows, mistakes, attachments) {
  const mistakesByAttempt = groupByAttempt(mistakes);
  const attachmentsByAttempt = groupByAttempt(attachments);
  return rows.map((row) => {
    const attemptMistakes = mistakesByAttempt.get(row.attempt_id) ?? [];
    const attemptAttachments = attachmentsByAttempt.get(row.attempt_id) ?? [];
    return {
      ...row,
      mistake_count: attemptMistakes.length,
      mistake_categories: attemptMistakes.map((mistake) => mistake.category).join(" | "),
      mistake_notes: attemptMistakes.map((mistake) => mistake.note).filter(Boolean).join(" | "),
      attachment_count: attemptAttachments.length,
      attachment_kinds: attemptAttachments.map((attachment) => attachment.attachment_kind).join(" | "),
      attachment_filenames: attemptAttachments.map((attachment) => attachment.filename).join(" | "),
    };
  });
}

export async function fetchOwnedTestHistoryPage(db, userId, options = {}) {
  assertAuthenticatedUserId(userId);
  const batchSize = normalizeBatchSize(options.batchSize);
  const cursor = options.cursor ?? null;
  const result = cursor
    ? await db.prepare(OWNED_TEST_HISTORY_NEXT_PAGE_SQL).bind(userId, cursor.completedAt, cursor.id, batchSize).all()
    : await db.prepare(OWNED_TEST_HISTORY_FIRST_PAGE_SQL).bind(userId, batchSize).all();
  const attemptRows = result.results ?? [];

  let rows = [];
  if (attemptRows.length) {
    const attemptIds = attemptRows.map((row) => row.attempt_id);
    const [mistakeResult, attachmentResult] = await Promise.all([
      db.prepare(buildOwnedTestMistakesSql(attemptIds.length)).bind(userId, ...attemptIds).all(),
      db.prepare(buildOwnedTestAttachmentsSql(attemptIds.length)).bind(userId, ...attemptIds).all(),
    ]);
    rows = enrichAttemptRows(attemptRows, mistakeResult.results ?? [], attachmentResult.results ?? []);
  }

  const last = attemptRows.at(-1);
  return {
    rows,
    nextCursor: attemptRows.length === batchSize && last
      ? { completedAt: last.completed_at, id: last.attempt_id }
      : null,
  };
}

export async function* iterateOwnedTestHistoryPages(db, userId, options = {}) {
  assertAuthenticatedUserId(userId);
  let cursor = null;
  for (;;) {
    const page = await fetchOwnedTestHistoryPage(db, userId, { ...options, cursor });
    yield page.rows;
    if (!page.nextCursor) return;
    if (cursor && cursor.completedAt === page.nextCursor.completedAt && cursor.id === page.nextCursor.id) {
      throw new Error("Test history export pagination cursor did not advance.");
    }
    cursor = page.nextCursor;
  }
}

export async function* generateOwnedTestHistoryCsvChunks(db, userId, options = {}) {
  assertAuthenticatedUserId(userId);
  yield `${encodeCsvRow(TEST_HISTORY_CSV_COLUMNS)}\r\n`;
  for await (const rows of iterateOwnedTestHistoryPages(db, userId, options)) {
    if (!rows.length) continue;
    const lines = rows.map((row) => encodeCsvRow(TEST_HISTORY_CSV_COLUMNS.map((column) => row[column])));
    yield `${lines.join("\r\n")}\r\n`;
  }
}
