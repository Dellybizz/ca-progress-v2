export type TestHistoryExportRow = {
  attempt_id: string;
  subject_id: string;
  subject_title: string;
  chapter_id: string;
  chapter_number: string;
  chapter_title: string;
  test_stage: string;
  attempt_number: number;
  marks_scored: number;
  marks_total: number;
  percentage: number;
  duration_minutes: number | null;
  completed_at: string;
  mistake_count: number;
  mistake_categories: string;
  mistake_notes: string;
  attachment_count: number;
  attachment_kinds: string;
  attachment_filenames: string;
  created_at: string;
};

export type TestHistoryExportCursor = { completedAt: string; id: string };

export type TestHistoryExportStatement = {
  bind(...values: unknown[]): TestHistoryExportStatement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
};

export type TestHistoryExportDatabase = {
  prepare(sql: string): TestHistoryExportStatement;
};

export const TEST_HISTORY_EXPORT_BATCH_SIZE: number;
export const TEST_HISTORY_EXPORT_MAX_BATCH_SIZE: number;
export const TEST_HISTORY_CSV_COLUMNS: readonly (keyof TestHistoryExportRow)[];
export const OWNED_TEST_HISTORY_FIRST_PAGE_SQL: string;
export const OWNED_TEST_HISTORY_NEXT_PAGE_SQL: string;

export declare function buildOwnedTestMistakesSql(attemptCount: number): string;
export declare function buildOwnedTestAttachmentsSql(attemptCount: number): string;

export declare function fetchOwnedTestHistoryPage(
  db: TestHistoryExportDatabase,
  userId: string,
  options?: { cursor?: TestHistoryExportCursor | null; batchSize?: number },
): Promise<{ rows: TestHistoryExportRow[]; nextCursor: TestHistoryExportCursor | null }>;

export declare function iterateOwnedTestHistoryPages(
  db: TestHistoryExportDatabase,
  userId: string,
  options?: { batchSize?: number },
): AsyncGenerator<TestHistoryExportRow[], void, unknown>;

export declare function generateOwnedTestHistoryCsvChunks(
  db: TestHistoryExportDatabase,
  userId: string,
  options?: { batchSize?: number },
): AsyncGenerator<string, void, unknown>;
