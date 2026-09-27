import { query, transaction } from "./database";

export type BuddySharing = { shareProfile: boolean; shareProgress: boolean; shareStreak: boolean; shareGoals: boolean; shareStudyStatus: boolean };
export type BuddyDashboard = {
  incomingRequests: Array<{ relationshipId: string; userId: string; displayName: string; requestedAt: string }>;
  outgoingRequests: Array<{ relationshipId: string; userId: string; displayName: string; requestedAt: string }>;
  buddies: Array<{ relationshipId: string; userId: string; displayName: string; muted: boolean; mySharing: BuddySharing; buddySharing: BuddySharing; accountability: { publicBio?: string; caLevel?: string; attemptKey?: string; weekStudyMinutes?: number; currentStreakDays?: number } }>;
  recentNudges: Array<{ id: string; sender_display_name: string | null; message: string; created_at: string }>;
  nudgeLimitPer24Hours: number;
};
export type InsightsSnapshot = {
  summary: { totalXp: number; level: { name: string; progressPercent: number; nextMinXp: number | null }; streak: { current: number; best: number }; achievements: Array<{ key: string; title: string; description: string; unlockedAt: string }> };
  model: { effectiveTotalXp: number; leaderboard: { rank: number | null; optedIn: boolean; publicAlias: string; category: string; period: string } };
  leaderboard: { category: string; period: string; entries: Array<{ rank: number; displayName: string; totalXp: number; levelName: string }> };
};
export type TestArchiveSnapshot = { attempts: Array<{ id: string; subjectTitle: string; chapterTitle: string; stage: string; attemptNumber: number; marksScored: number; marksTotal: number; percentage: number; completedAt: string; mistakes: Array<{ category: string; note?: string | null }> }>; journal: Array<{ id: string; category: string; chapterTitle: string }> };
export type AccountSnapshot = {
  fetchedAt: string;
  billing: { mode: string; currentPlan?: { id: string; name: string; tier_key: string; tagline: string; billing_cycle: string }; currentSubscription?: { status: string; starts_at: string; ends_at: string | null } | null; payments?: Array<{ id: string; amount_subunits: number; currency: string; status: string; created_at: string }> };
  pricing: { plans: Array<{ id: string; name: string; tagline: string; tier_key: string; billing_cycle: string; price_subunits: number | null; currency: string }>; currentPlanId: string | null };
  recurring: { mode: string; subscription: { status: string; financialState: string; chargeAt: string | null; paidThroughAt: string | null; cancelAtPeriodEnd: boolean } | null; charges: Array<{ paymentId: string; amountSubunits: number; currency: string; status: string; createdAt: string | null }> };
  tour: { step: number; completedAt: string | null };
  deletion: { status: string; scheduled_for: string | null } | null;
};
export type PeopleSnapshotKey = "buddy" | "insights_overall" | "insights_foundation" | "insights_intermediate" | "insights_final" | "analytics" | "tests" | "account";

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
