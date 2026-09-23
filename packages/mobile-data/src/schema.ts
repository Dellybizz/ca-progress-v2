export type SqlStatement = { sql: string; args?: unknown[] };

const syncColumns = `local_id TEXT PRIMARY KEY, server_id TEXT, server_version INTEGER NOT NULL DEFAULT 0, account_id TEXT NOT NULL, academic_context_key TEXT, local_state TEXT NOT NULL DEFAULT 'synced' CHECK(local_state IN ('synced','pending','conflict','failed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT`;
const entity = (table: string, extra: string) => `CREATE TABLE IF NOT EXISTS ${table} (${syncColumns}, ${extra}, FOREIGN KEY(account_id) REFERENCES local_accounts(account_id) ON DELETE CASCADE)`;

export const LOCAL_SCHEMA_VERSION = 1;
export const LOCAL_MIGRATIONS: ReadonlyArray<{ version: number; statements: SqlStatement[] }> = [{
  version: 1,
  statements: [
    { sql: "CREATE TABLE IF NOT EXISTS local_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)" },
    { sql: "CREATE TABLE IF NOT EXISTS local_accounts (account_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','locked')), last_opened_at TEXT NOT NULL, created_at TEXT NOT NULL)" },
    { sql: entity("application_config", "config_key TEXT NOT NULL, value_json TEXT NOT NULL, UNIQUE(account_id,config_key)") },
    { sql: entity("academic_catalog", "entity_type TEXT NOT NULL, slug TEXT, title TEXT NOT NULL, parent_server_id TEXT, payload_json TEXT NOT NULL DEFAULT '{}'") },
    { sql: entity("dashboard_projection", "projection_key TEXT NOT NULL, payload_json TEXT NOT NULL, UNIQUE(account_id,projection_key)") },
    { sql: entity("progress_records", "subject_id TEXT, chapter_id TEXT, stage TEXT, understanding INTEGER, payload_json TEXT NOT NULL DEFAULT '{}'") },
    { sql: entity("planner_items", "item_kind TEXT NOT NULL CHECK(item_kind IN ('task','goal','revision')), title TEXT NOT NULL, due_at TEXT, completed_at TEXT, payload_json TEXT NOT NULL DEFAULT '{}'") },
    { sql: entity("study_sessions", "started_at TEXT NOT NULL, ended_at TEXT, duration_seconds INTEGER NOT NULL DEFAULT 0, subject_id TEXT, chapter_id TEXT, payload_json TEXT NOT NULL DEFAULT '{}'") },
    { sql: "CREATE TABLE IF NOT EXISTS timer_state (account_id TEXT PRIMARY KEY, mode TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT, elapsed_seconds INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, FOREIGN KEY(account_id) REFERENCES local_accounts(account_id) ON DELETE CASCADE)" },
    { sql: entity("notes", "title TEXT NOT NULL, body_text TEXT NOT NULL DEFAULT '', subject_id TEXT, chapter_id TEXT") },
    { sql: entity("notifications", "notification_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, read_at TEXT, payload_json TEXT NOT NULL DEFAULT '{}'") },
    { sql: entity("resource_metadata", "title TEXT NOT NULL, resource_type TEXT NOT NULL, remote_url TEXT, local_file_id TEXT, byte_size INTEGER NOT NULL DEFAULT 0, last_accessed_at TEXT, pinned INTEGER NOT NULL DEFAULT 0") },
    { sql: entity("community_channels", "channel_key TEXT NOT NULL, title TEXT NOT NULL, last_message_at TEXT, payload_json TEXT NOT NULL DEFAULT '{}', UNIQUE(account_id,channel_key)") },
    { sql: entity("community_messages", "channel_key TEXT NOT NULL, author_id TEXT NOT NULL, body TEXT NOT NULL, sent_at TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}'") },
    { sql: entity("community_reactions", "message_server_id TEXT NOT NULL, emoji TEXT NOT NULL, actor_id TEXT NOT NULL") },
    { sql: "CREATE TABLE IF NOT EXISTS community_read_state (account_id TEXT NOT NULL, channel_key TEXT NOT NULL, last_read_server_id TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(account_id,channel_key), FOREIGN KEY(account_id) REFERENCES local_accounts(account_id) ON DELETE CASCADE)" },
    { sql: "CREATE TABLE IF NOT EXISTS sync_cursors (account_id TEXT NOT NULL, scope TEXT NOT NULL, cursor TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(account_id,scope), FOREIGN KEY(account_id) REFERENCES local_accounts(account_id) ON DELETE CASCADE)" },
    { sql: "CREATE TABLE IF NOT EXISTS mutation_outbox (mutation_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_local_id TEXT NOT NULL, operation TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(account_id) REFERENCES local_accounts(account_id) ON DELETE CASCADE)" },
    { sql: "CREATE TABLE IF NOT EXISTS conflicts (conflict_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_local_id TEXT NOT NULL, local_json TEXT NOT NULL, server_json TEXT NOT NULL, baseline_version INTEGER NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT, FOREIGN KEY(account_id) REFERENCES local_accounts(account_id) ON DELETE CASCADE)" },
    { sql: "CREATE TABLE IF NOT EXISTS tombstones (account_id TEXT NOT NULL, entity_type TEXT NOT NULL, server_id TEXT NOT NULL, server_version INTEGER NOT NULL, deleted_at TEXT NOT NULL, PRIMARY KEY(account_id,entity_type,server_id), FOREIGN KEY(account_id) REFERENCES local_accounts(account_id) ON DELETE CASCADE)" },
    { sql: "CREATE TABLE IF NOT EXISTS local_file_index (file_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, native_path TEXT NOT NULL, resource_local_id TEXT, byte_size INTEGER NOT NULL, checksum TEXT, last_accessed_at TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, pending_upload INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, FOREIGN KEY(account_id) REFERENCES local_accounts(account_id) ON DELETE CASCADE)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_planner_account_due ON planner_items(account_id,due_at,deleted_at)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_progress_account_context ON progress_records(account_id,academic_context_key,deleted_at)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_messages_account_channel ON community_messages(account_id,channel_key,sent_at DESC)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_outbox_account_status ON mutation_outbox(account_id,status,created_at)" },
    { sql: "CREATE INDEX IF NOT EXISTS idx_files_eviction ON local_file_index(account_id,pinned,pending_upload,last_accessed_at)" },
  ],
}];
