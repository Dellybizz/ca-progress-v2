const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MARKER_PREFIX = "phase1-verification-";

export function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function fixtureMarker(runId = process.env.GITHUB_RUN_ID || "local") {
  const normalized = String(runId).trim();
  if (!normalized || /[\r\n]/.test(normalized)) throw new Error("A stable run id is required for the verification marker");
  return `${MARKER_PREFIX}${normalized}`;
}

export function assertExactId(id) {
  const value = String(id ?? "").trim();
  if (!value) throw new Error("Cleanup requires a captured entity id");
  if (value.includes("%") || value.includes("*") || /[\r\n]/.test(value)) {
    throw new Error("Cleanup ids must be exact values; wildcard/newline cleanup is forbidden");
  }
  return value;
}

export function assertIdentifier(value) {
  if (!IDENTIFIER.test(String(value ?? ""))) throw new Error(`Unsafe SQL identifier: ${value}`);
  return value;
}

export function exactDeleteSql(table, idColumn, id) {
  const safeTable = assertIdentifier(table);
  const safeColumn = assertIdentifier(idColumn);
  const safeId = assertExactId(id);
  return `DELETE FROM ${safeTable} WHERE ${safeColumn}=${sqlLiteral(safeId)}`;
}

export class ExactCleanupRegistry {
  #entries = [];

  capture({ kind, id, cleanup }) {
    const exactId = assertExactId(id);
    if (typeof cleanup !== "function") throw new Error("Cleanup entry requires a cleanup function");
    this.#entries.push({ kind: String(kind || "entity"), id: exactId, cleanup });
    return exactId;
  }

  get size() {
    return this.#entries.length;
  }

  async run() {
    const results = [];
    while (this.#entries.length) {
      const entry = this.#entries.pop();
      try {
        await entry.cleanup(entry.id);
        results.push({ kind: entry.kind, id: entry.id, status: "passed" });
      } catch (error) {
        results.push({ kind: entry.kind, id: entry.id, status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }
}

const PROGRESS_COLUMNS = ["completed_at", "revision_1_at", "revision_2_at", "test_1_at", "test_2_at", "created_at", "updated_at"];

export function normalizeProgressSnapshot(userId, chapterId, row) {
  const exactUserId = assertExactId(userId);
  const exactChapterId = assertExactId(chapterId);
  if (!row) return { exists: false, user_id: exactUserId, chapter_id: exactChapterId };
  const snapshot = { exists: true, user_id: exactUserId, chapter_id: exactChapterId };
  for (const column of PROGRESS_COLUMNS) snapshot[column] = row[column] ?? null;
  return snapshot;
}

export function buildProgressRestoreSql(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("A progress snapshot is required");
  const userId = assertExactId(snapshot.user_id);
  const chapterId = assertExactId(snapshot.chapter_id);
  if (!snapshot.exists) {
    return `DELETE FROM chapter_progress WHERE user_id=${sqlLiteral(userId)} AND chapter_id=${sqlLiteral(chapterId)}`;
  }
  const columns = ["user_id", "chapter_id", ...PROGRESS_COLUMNS];
  const values = [userId, chapterId, ...PROGRESS_COLUMNS.map((column) => snapshot[column] ?? null)].map(sqlLiteral);
  const updates = PROGRESS_COLUMNS.map((column) => `${column}=excluded.${column}`).join(",");
  return `INSERT INTO chapter_progress (${columns.join(",")}) VALUES (${values.join(",")}) ON CONFLICT(user_id,chapter_id) DO UPDATE SET ${updates}`;
}

export function progressSnapshotComparable(snapshot) {
  if (!snapshot?.exists) return { exists: false };
  return Object.fromEntries([["exists", true], ...PROGRESS_COLUMNS.map((column) => [column, snapshot[column] ?? null])]);
}

export function progressStageSummary(snapshot) {
  if (!snapshot?.exists) return { exists: false, completed: false, revision1: false, revision2: false, test1: false, test2: false };
  return {
    exists: true,
    completed: Boolean(snapshot.completed_at),
    revision1: Boolean(snapshot.revision_1_at),
    revision2: Boolean(snapshot.revision_2_at),
    test1: Boolean(snapshot.test_1_at),
    test2: Boolean(snapshot.test_2_at),
  };
}

export const PHASE2_MARKER_PREFIX = MARKER_PREFIX;
