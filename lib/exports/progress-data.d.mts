export type ProgressDataProfile = {
  display_name: string | null;
  ca_level: string | null;
  group_choice: string | null;
  attempt_key: string | null;
};

export type ProgressDataRow = {
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

export type ProgressDataDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = ProgressDataProfile>(): Promise<T | null>;
      all<T = ProgressDataRow>(): Promise<{ results?: T[] }>;
    };
  };
};

export const OWNED_PROGRESS_PROFILE_SQL: string;
export const OWNED_PROGRESS_ROWS_SQL: string;
export function fetchOwnedProgressData(db: ProgressDataDb, userId: string): Promise<{ profile: ProgressDataProfile | null; rows: ProgressDataRow[] }>;
