import { execute, openLocalDatabase, query, transaction, wipeDatabase, type DatabaseState } from "./database";

export type LocalSyncState = "synced" | "pending" | "conflict" | "failed";
export type LocalTimer = { mode: "focus" | "stopwatch"; status: "idle" | "running" | "paused"; startedAt: string | null; elapsedSeconds: number; updatedAt: string };
export type LocalDashboard = { today: Array<{ title: string; meta: string; state: string }>; progress: { value: string; hint: string }; community: Array<{ channel: string; preview: string; time: string }> };
export type LocalAccountRepository = {
  accountId: string; database: DatabaseState;
  readDashboard(): Promise<LocalDashboard>;
  readTimer(): Promise<LocalTimer>;
  saveTimer(timer: LocalTimer): Promise<void>;
  subscribe(listener: () => void): () => void;
  lock(): Promise<void>; removeFromDevice(): Promise<void>; cleanup(maxBytes?: number): Promise<number>;
};

const listeners = new Map<string, Set<() => void>>();
const notify = (accountId: string) => { for (const listener of listeners.get(accountId) || []) listener(); };
const now = () => new Date().toISOString();

export async function openAccountRepository(account: { id: string; displayName: string }, unlock = false): Promise<LocalAccountRepository | null> {
  const database = await openLocalDatabase();
  if (!database.available) return null;
  const timestamp = now();
  await execute("INSERT INTO local_accounts(account_id,display_name,state,last_opened_at,created_at) VALUES(?,?,'active',?,?) ON CONFLICT(account_id) DO UPDATE SET display_name=excluded.display_name,last_opened_at=excluded.last_opened_at", [account.id, account.displayName, timestamp, timestamp]);
  const state=await query<{state:string}>("SELECT state FROM local_accounts WHERE account_id=? LIMIT 1",[account.id]);
  if(state[0]?.state==="locked"&&!unlock)return null;
  if(unlock)await execute("UPDATE local_accounts SET state='active' WHERE account_id=?",[account.id]);
  const existing = await query<{ count: number }>("SELECT COUNT(*) AS count FROM dashboard_projection WHERE account_id=?", [account.id]);
  if (Number(existing[0]?.count || 0) === 0) {
    const id = crypto.randomUUID();
    const dashboard: LocalDashboard = { today: [{ title: "Continue your next chapter", meta: "Open Progress to choose a chapter", state: "Ready" }, { title: "Plan today's study", meta: "Saved locally on this device", state: "Local" }], progress: { value: "—", hint: "Waiting for first secure sync" }, community: [{ channel: "Announcements", preview: "Recent conversations will be retained on this device.", time: "Saved" }] };
    await transaction([
      { sql: "INSERT INTO dashboard_projection(local_id,account_id,projection_key,payload_json,created_at,updated_at) VALUES(?,?, 'home',?,?,?)", args: [id, account.id, JSON.stringify(dashboard), timestamp, timestamp] },
      { sql: "INSERT OR IGNORE INTO timer_state(account_id,mode,status,elapsed_seconds,updated_at) VALUES(?,'focus','idle',0,?)", args: [account.id, timestamp] },
    ]);
  }

  return {
    accountId: account.id, database,
    async readDashboard() { const rows = await query<{ payload_json: string }>("SELECT payload_json FROM dashboard_projection WHERE account_id=? AND projection_key='home' AND deleted_at IS NULL LIMIT 1", [account.id]); return JSON.parse(rows[0]?.payload_json || "{}") as LocalDashboard; },
    async readTimer() { const rows = await query<{ mode: "focus"|"stopwatch"; status: "idle"|"running"|"paused"; started_at: string|null; elapsed_seconds: number; updated_at:string }>("SELECT mode,status,started_at,elapsed_seconds,updated_at FROM timer_state WHERE account_id=? LIMIT 1", [account.id]); const row=rows[0]; return { mode: row?.mode || "focus", status: row?.status || "idle", startedAt: row?.started_at || null, elapsedSeconds: Number(row?.elapsed_seconds || 0), updatedAt: row?.updated_at || now() }; },
    async saveTimer(timer) { await execute("INSERT INTO timer_state(account_id,mode,status,started_at,elapsed_seconds,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET mode=excluded.mode,status=excluded.status,started_at=excluded.started_at,elapsed_seconds=excluded.elapsed_seconds,updated_at=excluded.updated_at", [account.id,timer.mode,timer.status,timer.startedAt,timer.elapsedSeconds,timer.updatedAt]); notify(account.id); },
    subscribe(listener) { const accountListeners=listeners.get(account.id) || new Set(); accountListeners.add(listener); listeners.set(account.id,accountListeners); return () => { accountListeners.delete(listener); if(!accountListeners.size) listeners.delete(account.id); }; },
    async lock() { await execute("UPDATE local_accounts SET state='locked' WHERE account_id=?",[account.id]); notify(account.id); },
    async removeFromDevice() { await execute("DELETE FROM local_accounts WHERE account_id=?",[account.id]); listeners.delete(account.id); },
    async cleanup(maxBytes=250*1024*1024) { const total=await query<{total:number}>("SELECT COALESCE(SUM(byte_size),0) AS total FROM local_file_index WHERE account_id=?",[account.id]); let remaining=Number(total[0]?.total||0); if(remaining<=maxBytes)return 0; const candidates=await query<{file_id:string;byte_size:number}>("SELECT f.file_id,f.byte_size FROM local_file_index f WHERE f.account_id=? AND f.pinned=0 AND f.pending_upload=0 AND NOT EXISTS(SELECT 1 FROM mutation_outbox m WHERE m.account_id=f.account_id AND m.entity_local_id=f.resource_local_id AND m.status IN ('pending','failed')) ORDER BY f.last_accessed_at ASC",[account.id]); let evicted=0; for(const item of candidates){if(remaining<=maxBytes)break;await execute("DELETE FROM local_file_index WHERE account_id=? AND file_id=?",[account.id,item.file_id]);remaining-=Number(item.byte_size);evicted++;}return evicted; },
  };
}

export async function wipeAllOfflineData() { listeners.clear(); await wipeDatabase(); }
