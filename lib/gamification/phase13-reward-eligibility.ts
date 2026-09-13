import "server-only";

import { getD1RuntimeDatabase } from "@/lib/data/d1/client";

type RewardTier = "premium" | "pro";
type GrantRow = {
  id: string;
  plan_id: string;
  reward_tier: RewardTier;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "withheld" | "active" | "expired" | "revoked";
  rank: number;
  name: string;
  tier_key: string;
};

export async function getEligibleLeaderboardRewardPlan(userId: string, now = new Date()) {
  const db = getD1RuntimeDatabase();
  const nowIso = now.toISOString();
  const activeFlags = await db.prepare("SELECT COUNT(*) AS count FROM anti_cheat_flags WHERE user_id=?1 AND status IN ('pending','upheld')").bind(userId).first<{ count: number }>();
  const hasActiveFlags = Number(activeFlags?.count ?? 0) > 0;

  const grant = await db.prepare(`SELECT g.id,g.plan_id,g.reward_tier,g.starts_at,g.ends_at,g.status,p.rank,p.name,p.tier_key
    FROM leaderboard_reward_grants g
    JOIN subscription_plans p ON p.id=g.plan_id AND p.active=1
    WHERE g.user_id=?1 AND g.status IN ('scheduled','active','withheld')
      AND g.starts_at<=?2 AND g.ends_at>?2
    ORDER BY p.rank DESC,g.rank ASC LIMIT 1`).bind(userId, nowIso).first<GrantRow>();
  if (!grant) return null;

  if (hasActiveFlags) {
    if (grant.status !== "withheld") await db.prepare("UPDATE leaderboard_reward_grants SET status='withheld',updated_at=?1 WHERE id=?2 AND status IN ('scheduled','active')").bind(nowIso, grant.id).run();
    return null;
  }

  if (grant.status === "withheld") await db.prepare("UPDATE leaderboard_reward_grants SET status='scheduled',updated_at=?1 WHERE id=?2 AND status='withheld'").bind(nowIso, grant.id).run();
  return {
    grantId: grant.id,
    planId: grant.plan_id,
    rewardTier: grant.reward_tier,
    startsAt: grant.starts_at,
    endsAt: grant.ends_at,
    rank: Number(grant.rank),
    planName: grant.name,
    tierKey: grant.tier_key,
  };
}
