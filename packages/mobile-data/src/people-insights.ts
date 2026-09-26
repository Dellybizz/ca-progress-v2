import { query, transaction } from "./database";

export type BuddyDashboard = {
  incomingRequests: Array<{ relationshipId: string; userId: string; displayName: string; requestedAt: string }>;
  outgoingRequests: Array<{ relationshipId: string; userId: string; displayName: string; requestedAt: string }>;
  buddies: Array<{ relationshipId: string; userId: string; displayName: string; muted: boolean }>;
};
export type InsightsSnapshot = {
  summary: { totalXp: number; level: { name: string; progressPercent: number; nextMinXp: number | null }; streak: { current: number; best: number }; achievements: Array<{ key: string; title: string; description: string; unlockedAt: string }> };
  model: { effectiveTotalXp: number; leaderboard: { rank: number | null; optedIn: boolean; publicAlias: string; category: string; period: string } };
  leaderboard: { category: string; period: string; entries: Array<{ rank: number; displayName: string; totalXp: number; levelName: string }> };
};
export type TestArchiveSnapshot = { attempts: Array<{ id: string; subjectTitle: string; chapterTitle: string; stage: string; attemptNumber: number; marksScored: number; marksTotal: number; percentage: number; completedAt: string; mistakes: Array<{ category: string; note?: string | null }> }>; journal: Array<{ id: string; category: string; chapterTitle: string }> };
export type PeopleSnapshotKey = "buddy" | "insights_overall" | "insights_foundation" | "insights_intermediate" | "insights_final" | "analytics" | "tests";

const keyFor = (kind: PeopleSnapshotKey) => `people_p5_${kind}`;

export async function readPeopleSnapshot<T>(accountId: string, kind: PeopleSnapshotKey): Promise<T | null> {
  const rows = await query<{ value_json: string }>(`SELECT value_json FROM application_config
    WHERE account_id=? AND config_key=? AND academic_context_key=(SELECT scope FROM sync_cursors WHERE account_id=? ORDER BY updated_at DESC LIMIT 1)
    AND deleted_at IS NULL LIMIT 1`, [accountId, keyFor(kind), accountId]);
  try { return rows[0] ? JSON.parse(rows[0].value_json) as T : null; } catch { return null; }
}

export async function storePeopleSnapshot(accountId: string, kind: PeopleSnapshotKey, value: unknown): Promise<void> {
  const scopes = await query<{ scope: string }>("SELECT scope FROM sync_cursors WHERE account_id=? ORDER BY updated_at DESC LIMIT 1", [accountId]);
  const scope = scopes[0]?.scope;
  if (!scope) return;
  const at = new Date().toISOString(), key = keyFor(kind);
  await transaction([{ sql: `INSERT INTO application_config(local_id,server_id,account_id,academic_context_key,local_state,created_at,updated_at,config_key,value_json)
    VALUES(?,NULL,?,?,'synced',?,?,?,?) ON CONFLICT(account_id,config_key) DO UPDATE SET
    academic_context_key=excluded.academic_context_key,value_json=excluded.value_json,updated_at=excluded.updated_at,deleted_at=NULL`,
    args: [`${accountId}:${key}`, accountId, scope, at, at, key, JSON.stringify(value)] }]);
}
