export type FullBackupDataset = {
  readonly key: string;
  readonly table: string;
  readonly ownerColumn: string;
  readonly columns: readonly string[];
};

export type FullBackupStatement = {
  bind(...values: unknown[]): FullBackupStatement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
};

export type FullBackupDatabase = {
  prepare(sql: string): FullBackupStatement;
};

export const FULL_BACKUP_BATCH_SIZE: number;
export const FULL_BACKUP_MAX_BATCH_SIZE: number;
export const FULL_BACKUP_DATASETS: readonly FullBackupDataset[];
export const FULL_BACKUP_EXCLUDED_OPERATIONAL_TABLES: readonly string[];
export const OWNED_RESOURCE_FILES_FIRST_PAGE_SQL: string;
export const OWNED_RESOURCE_FILES_NEXT_PAGE_SQL: string;
export const OWNED_TEST_FILES_FIRST_PAGE_SQL: string;
export const OWNED_TEST_FILES_NEXT_PAGE_SQL: string;

export declare function buildOwnedBackupPageSql(input: { dataset: FullBackupDataset; cursor?: number | null }): string;
export declare function fetchOwnedBackupDatasetPage(
  db: FullBackupDatabase,
  userId: string,
  dataset: FullBackupDataset,
  options?: { cursor?: number | null; batchSize?: number },
): Promise<{ rows: Record<string, unknown>[]; nextCursor: number | null }>;
export declare function iterateOwnedBackupDatasetPages(
  db: FullBackupDatabase,
  userId: string,
  dataset: FullBackupDataset,
  options?: { batchSize?: number },
): AsyncGenerator<Record<string, unknown>[], void, unknown>;
export declare function iterateOwnedResourceFileRows(
  db: FullBackupDatabase,
  userId: string,
  options?: { batchSize?: number },
): AsyncGenerator<Record<string, unknown>, void, unknown>;
export declare function iterateOwnedTestFileRows(
  db: FullBackupDatabase,
  userId: string,
  options?: { batchSize?: number },
): AsyncGenerator<Record<string, unknown>, void, unknown>;
