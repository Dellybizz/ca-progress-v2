export type StudyExportRow = {
  session_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  mode: string;
  timezone: string;
  subject_id: string | null;
  subject_title: string | null;
  chapter_id: string | null;
  chapter_title: string | null;
  focus_target_seconds: number | null;
  break_target_seconds: number | null;
  task_id: string | null;
  plan_item_id: string | null;
  intended_task_title: string | null;
  pause_count: number;
  paused_seconds: number;
  completion_state: string;
  understanding_score: number | null;
  focus_rating: string | null;
  reflection_saved_at: string | null;
  created_at: string;
};

export type StudyExportCursor = { startedAt: string; id: string };

export type StudyExportStatement = {
  bind(...values: unknown[]): StudyExportStatement;
  all<T = StudyExportRow>(): Promise<{ results?: T[] }>;
};

export type StudyExportDatabase = {
  prepare(sql: string): StudyExportStatement;
};

export const STUDY_EXPORT_BATCH_SIZE: number;
export const STUDY_EXPORT_MAX_BATCH_SIZE: number;
export const STUDY_CSV_COLUMNS: readonly (keyof StudyExportRow)[];
export const OWNED_STUDY_FIRST_PAGE_SQL: string;
export const OWNED_STUDY_NEXT_PAGE_SQL: string;

export declare function fetchOwnedStudySessionPage(
  db: StudyExportDatabase,
  userId: string,
  options?: { cursor?: StudyExportCursor | null; batchSize?: number },
): Promise<{ rows: StudyExportRow[]; nextCursor: StudyExportCursor | null }>;

export declare function iterateOwnedStudySessionPages(
  db: StudyExportDatabase,
  userId: string,
  options?: { batchSize?: number },
): AsyncGenerator<StudyExportRow[], void, unknown>;

export declare function generateOwnedStudyCsvChunks(
  db: StudyExportDatabase,
  userId: string,
  options?: { batchSize?: number },
): AsyncGenerator<string, void, unknown>;
