import { Capacitor, registerPlugin } from "@capacitor/core";
import { LOCAL_MIGRATIONS, LOCAL_SCHEMA_VERSION, type SqlStatement } from "./schema";

type QueryResult<T> = { rows: T[] };
type LocalDatabasePlugin = {
  open(): Promise<{ recovered: boolean }>;
  execute(input: { sql: string; args?: unknown[] }): Promise<void>;
  transaction(input: { statements: SqlStatement[] }): Promise<void>;
  query<T>(input: { sql: string; args?: unknown[] }): Promise<QueryResult<T>>;
  checkpoint(): Promise<void>; restore(): Promise<void>; wipe(): Promise<void>;
};
const NativeDatabase = registerPlugin<LocalDatabasePlugin>("LocalDatabase");

export type DatabaseState = { available: boolean; recovered: boolean; schemaVersion: number };
let openPromise: Promise<DatabaseState> | null = null;

export async function openLocalDatabase(): Promise<DatabaseState> {
  if (!Capacitor.isNativePlatform()) return { available: false, recovered: false, schemaVersion: 0 };
  openPromise ??= (async () => {
    const opened = await NativeDatabase.open();
    let version = 0;
    try { version = Number((await NativeDatabase.query<{ value: string }>({ sql: "SELECT value FROM local_meta WHERE key='schema_version'" })).rows[0]?.value || 0); } catch { version = 0; }
    if (version > LOCAL_SCHEMA_VERSION) throw new Error("This app build cannot open the newer local database schema.");
    if (version < LOCAL_SCHEMA_VERSION) {
      await NativeDatabase.checkpoint();
      try {
        for (const migration of LOCAL_MIGRATIONS.filter((item) => item.version > version)) {
          const now = new Date().toISOString();
          await NativeDatabase.transaction({ statements: [...migration.statements, { sql: "INSERT OR REPLACE INTO local_meta(key,value,updated_at) VALUES('schema_version',?,?)", args: [String(migration.version), now] }] });
          version = migration.version;
        }
        await NativeDatabase.checkpoint();
      } catch (error) { await NativeDatabase.restore(); throw error; }
    }
    return { available: true, recovered: opened.recovered, schemaVersion: version };
  })();
  return openPromise;
}

export async function execute(sql: string, args: unknown[] = []) { await openLocalDatabase(); return NativeDatabase.execute({ sql, args }); }
export async function transaction(statements: SqlStatement[]) { await openLocalDatabase(); return NativeDatabase.transaction({ statements }); }
export async function query<T>(sql: string, args: unknown[] = []) { await openLocalDatabase(); return (await NativeDatabase.query<T>({ sql, args })).rows; }
export async function wipeDatabase() { await NativeDatabase.wipe(); openPromise = null; }
