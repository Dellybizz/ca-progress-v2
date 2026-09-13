import "server-only";

import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { getGamificationSummary, reconcileGamification, type GamificationSummary } from "./service";
import { levelForXp } from "./policy.mjs";
import {
  IMPOSSIBLE_SESSION_SECONDS,
  REFERRAL_ACTIVATION_XP,
  detectExcessiveDailyXp,
  detectFakeTestPattern,
  detectProgressLoop,
  detectRapidChapterCompletion,
  detectSessionSignals,
  monthPeriodKey,
  monthWindow,
  nextMonthRewardWindow,
  normalizeLeaderboardCategory,
  publicLeaderboardEntry,
  publicShareCard,
  referralActivationState,
  rewardForRank,
  sanitizePublicAlias,
} from "./phase13-policy.mjs";

type LeaderboardCategory = "overall" | "foundation" | "intermediate" | "final";
type RewardTier = "premium" | "pro";
type FlagStatus = "pending" | "cleared" | "upheld";
type FlagDecision = "clear" | "uphold";

type LeaderboardDbRow = {
  user_id: string;
  public_alias: string | null;
  ca_level: string | null;
  total_xp: number;
};
type LeaderboardInternalEntry = {
  userId: string;
  rank: number;
  displayName: string;
  totalXp: number;
  levelName: string;
};
type SessionRow = { id: string; duration_seconds: number; started_at: string; ended_at: string };
type ProgressCompletionRow = { chapter_id: string; completed_at: string };
type ProgressEventRow = { chapter_id: string; stage: string; action: string; created_at: string };
type TestRow = { id: string; completed_at: string; duration_minutes: number | null };
type XpRow = { occurred_at: string; xp_amount: number };
type FlagRow = {
  id: string;
  user_id: string;
  signal_type: string;
  evidence_key: string;
  severity: string;
  status: FlagStatus;
  evidence: string;
  detected_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
};
type ReferralRow = {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referral_code: string;
  status: "pending" | "activated" | "cancelled";
  qualifying_session_count: number;
  joined_at: string;
  activated_at: string | null;
};
type PlanRow = { id: string; tier_key: string; name: string; rank: number; sort_order: number };
type RewardGrantRow = {
  id: string;
  competition_period: string;
  reward_period: string;
  rank: number;
  reward_tier: RewardTier;
  plan_id: string;
  status: "scheduled" | "withheld" | "active" | "expired" | "revoked";
  starts_at: string;
  ends_at: string;
};
type ShareCard = Readonly<{ kind: string; title: string; primary: string; secondary: string }>;

const db = () => getD1RuntimeDatabase();
const iso = (date = new Date()) => date.toISOString();
const uuid = () => crypto.randomUUID();

function cleanReviewNotes(value: unknown) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000) : "";
}

function categoryCode(value: string): LeaderboardCategory {
  return normalizeLeaderboardCategory(value) as LeaderboardCategory;
}

async function loadRankedEntries(category: LeaderboardCategory, periodKey: string): Promise<LeaderboardInternalEntry[]> {
  const window = monthWindow(periodKey);
  const levelFilter = category === "overall" ? "" : "AND lower(COALESCE(p.ca_level,''))=?3";
  const bindings: unknown[] = [window.startsAt, window.endsAt];
  if (category !== "overall") bindings.push(category);
  const result = await db().prepare(`WITH base_xp AS (
      SELECT user_id,SUM(xp_amount) AS xp FROM xp_ledger
      WHERE occurred_at>=?1 AND occurred_at<?2 GROUP BY user_id
    ), bonus_xp AS (
      SELECT user_id,SUM(xp_amount) AS xp FROM gamification_bonus_ledger
      WHERE occurred_at>=?1 AND occurred_at<?2 GROUP BY user_id
    )
    SELECT lp.user_id,lp.public_alias,p.ca_level,
      COALESCE(base_xp.xp,0)+COALESCE(bonus_xp.xp,0) AS total_xp
    FROM leaderboard_profiles lp
    LEFT JOIN profiles p ON p.user_id=lp.user_id
    LEFT JOIN base_xp ON base_xp.user_id=lp.user_id
    LEFT JOIN bonus_xp ON bonus_xp.user_id=lp.user_id
    WHERE lp.opted_in=1 ${levelFilter}
    ORDER BY total_xp DESC,lp.user_id ASC
    LIMIT 500`).bind(...bindings).all<LeaderboardDbRow>();
  return (result.results ?? []).map((row, index) => {
    const totalXp = Math.max(0, Number(row.total_xp ?? 0));
    return {
      userId: row.user_id,
      rank: index + 1,
      displayName: sanitizePublicAlias(row.public_alias),
      totalXp,
      levelName: levelForXp(totalXp).name,
    };
  });
}

async function reconcileOptedInUsers(now: Date) {
  const rows = await db().prepare("SELECT user_id FROM leaderboard_profiles WHERE opted_in=1 ORDER BY user_id LIMIT 500").all<{ user_id: string }>();
  for (const row of rows.results ?? []) await reconcileGamification(row.user_id, now);
}

export async function getLeaderboard(rawCategory: string, now = new Date(), requestedPeriod?: string) {
  const category = categoryCode(rawCategory);
  const period = requestedPeriod ?? monthPeriodKey(now);
  const entries = await loadRankedEntries(category, period);
  return {
    category,
    period,
    entries: entries.map((entry) => publicLeaderboardEntry(entry)),
  };
}

export async function setLeaderboardPreference(userId: string, input: { optedIn: boolean; publicAlias?: unknown }) {
  const optedIn = Boolean(input.optedIn);
  const alias = sanitizePublicAlias(input.publicAlias);
  const now = iso();
  await db().prepare(`INSERT INTO leaderboard_profiles(user_id,opted_in,public_alias,opted_in_at,created_at,updated_at)
    VALUES(?1,?2,?3,CASE WHEN ?2=1 THEN ?4 ELSE NULL END,?4,?4)
    ON CONFLICT(user_id) DO UPDATE SET
      opted_in=excluded.opted_in,
      public_alias=CASE WHEN excluded.opted_in=1 THEN excluded.public_alias ELSE leaderboard_profiles.public_alias END,
      opted_in_at=CASE WHEN excluded.opted_in=1 THEN COALESCE(leaderboard_profiles.opted_in_at,excluded.opted_in_at) ELSE NULL END,
      updated_at=excluded.updated_at`).bind(userId, optedIn ? 1 : 0, alias, now).run();
  return { optedIn, publicAlias: alias };
}

async function currentLeaderboardPreference(userId: string) {
  const row = await db().prepare("SELECT opted_in,public_alias FROM leaderboard_profiles WHERE user_id=?1 LIMIT 1").bind(userId).first<{ opted_in: number; public_alias: string | null }>();
  return { optedIn: Number(row?.opted_in ?? 0) === 1, publicAlias: sanitizePublicAlias(row?.public_alias) };
}

export async function ensureReferralCode(userId: string) {
  const existing = await db().prepare("SELECT code FROM referral_codes WHERE user_id=?1 LIMIT 1").bind(userId).first<{ code: string }>();
  if (existing?.code) return existing.code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    try {
      await db().prepare("INSERT INTO referral_codes(user_id,code,created_at) VALUES(?1,?2,?3)").bind(userId, code, iso()).run();
      return code;
    } catch {
      const raced = await db().prepare("SELECT code FROM referral_codes WHERE user_id=?1 LIMIT 1").bind(userId).first<{ code: string }>();
      if (raced?.code) return raced.code;
    }
  }
  throw new Error("A referral code could not be created.");
}

export async function registerReferral(referredUserId: string, rawCode: unknown) {
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase().slice(0, 32) : "";
  if (!/^[A-Z0-9]{8,32}$/.test(code)) throw new Error("Referral code is invalid.");
  const owner = await db().prepare("SELECT user_id FROM referral_codes WHERE code=?1 LIMIT 1").bind(code).first<{ user_id: string }>();
  if (!owner) throw new Error("Referral code was not found.");
  if (owner.user_id === referredUserId) throw new Error("You cannot use your own referral code.");
  const existing = await db().prepare("SELECT referral_code,status FROM referrals WHERE referred_user_id=?1 LIMIT 1").bind(referredUserId).first<{ referral_code: string; status: string }>();
  if (existing) {
    if (existing.referral_code === code) return { status: existing.status, alreadyRegistered: true };
    throw new Error("This account already has a referral source.");
  }
  const now = iso();
  await db().prepare(`INSERT INTO referrals(id,referrer_user_id,referred_user_id,referral_code,status,qualifying_session_count,joined_at,created_at,updated_at)
    VALUES(?1,?2,?3,?4,'pending',0,?5,?5,?5)`).bind(uuid(), owner.user_id, referredUserId, code, now).run();
  return { status: "pending", alreadyRegistered: false };
}

export async function reconcileReferralActivation(referredUserId: string) {
  const referral = await db().prepare(`SELECT id,referrer_user_id,referred_user_id,referral_code,status,qualifying_session_count,joined_at,activated_at
    FROM referrals WHERE referred_user_id=?1 LIMIT 1`).bind(referredUserId).first<ReferralRow>();
  if (!referral || referral.status === "cancelled") return null;
  const sessions = await db().prepare(`SELECT id,duration_seconds,started_at,ended_at FROM study_sessions
    WHERE user_id=?1 AND ended_at>=?2 ORDER BY ended_at ASC,id ASC LIMIT 100`).bind(referredUserId, referral.joined_at).all<SessionRow>();
  const activation = referralActivationState(sessions.results ?? []);
  if (referral.status === "activated") return { status: "activated", qualifyingSessionCount: Math.max(referral.qualifying_session_count, activation.qualifyingCount), rewarded: true };
  const now = iso();
  if (!activation.activated) {
    await db().prepare("UPDATE referrals SET qualifying_session_count=?1,updated_at=?2 WHERE id=?3 AND status='pending'").bind(activation.qualifyingCount, now, referral.id).run();
    return { status: "pending", qualifyingSessionCount: activation.qualifyingCount, rewarded: false };
  }
  const eventKey = `referral_activation:${referral.id}`;
  await db().batch([
    db().prepare(`INSERT OR IGNORE INTO gamification_bonus_ledger(id,user_id,event_key,event_type,source_id,xp_amount,occurred_at,metadata,created_at)
      VALUES(?1,?2,?3,'referral_activation',?4,?5,?6,?7,?6)`)
      .bind(`bonus:${referral.id}`, referral.referrer_user_id, eventKey, referral.id, REFERRAL_ACTIVATION_XP, now, JSON.stringify({ qualifyingSessionCount: activation.qualifyingCount })),
    db().prepare("UPDATE referrals SET status='activated',qualifying_session_count=?1,activated_at=COALESCE(activated_at,?2),updated_at=?2 WHERE id=?3 AND status='pending'")
      .bind(activation.qualifyingCount, now, referral.id),
  ]);
  return { status: "activated", qualifyingSessionCount: activation.qualifyingCount, rewarded: true };
}

async function insertFlag(input: { userId: string; signalType: string; evidenceKey: string; severity: "low" | "medium" | "high"; evidence: Record<string, unknown>; detectedAt: string }) {
  await db().prepare(`INSERT OR IGNORE INTO anti_cheat_flags(
      id,user_id,signal_type,evidence_key,severity,status,evidence,detected_at,created_at,updated_at
    ) VALUES(?1,?2,?3,?4,?5,'pending',?6,?7,?7,?7)`)
    .bind(uuid(), input.userId, input.signalType, input.evidenceKey.slice(0, 240), input.severity, JSON.stringify(input.evidence), input.detectedAt).run();
}

export async function scanAntiCheatForUser(userId: string, now = new Date()) {
  await reconcileGamification(userId, now);
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [sessions, progress, progressEvents, tests, baseXp, bonusXp] = await Promise.all([
    db().prepare("SELECT id,duration_seconds,started_at,ended_at FROM study_sessions WHERE user_id=?1 AND ended_at>=?2 ORDER BY started_at ASC LIMIT 5000").bind(userId, cutoff).all<SessionRow>(),
    db().prepare("SELECT chapter_id,completed_at FROM chapter_progress WHERE user_id=?1 AND completed_at IS NOT NULL AND completed_at>=?2 ORDER BY completed_at ASC").bind(userId, cutoff).all<ProgressCompletionRow>(),
    db().prepare("SELECT chapter_id,stage,action,created_at FROM progress_events WHERE user_id=?1 AND created_at>=?2 ORDER BY created_at ASC LIMIT 5000").bind(userId, cutoff).all<ProgressEventRow>(),
    db().prepare("SELECT id,completed_at,duration_minutes FROM test_attempts WHERE user_id=?1 AND completed_at>=?2 ORDER BY completed_at ASC LIMIT 5000").bind(userId, cutoff).all<TestRow>(),
    db().prepare("SELECT occurred_at,xp_amount FROM xp_ledger WHERE user_id=?1 AND occurred_at>=?2 ORDER BY occurred_at ASC LIMIT 10000").bind(userId, cutoff).all<XpRow>(),
    db().prepare("SELECT occurred_at,xp_amount FROM gamification_bonus_ledger WHERE user_id=?1 AND occurred_at>=?2 ORDER BY occurred_at ASC LIMIT 1000").bind(userId, cutoff).all<XpRow>(),
  ]);
  const detectedAt = iso(now);
  const sessionSignals = detectSessionSignals(sessions.results ?? []);
  for (const sessionId of sessionSignals.impossibleSessionIds) {
    await insertFlag({ userId, signalType: "impossible_timer", evidenceKey: sessionId, severity: "high", evidence: { sessionId, thresholdSeconds: IMPOSSIBLE_SESSION_SECONDS }, detectedAt });
  }
  if (sessionSignals.repeatedImpossible) {
    await insertFlag({ userId, signalType: "repeated_impossible_sessions", evidenceKey: sessionSignals.impossibleSessionIds.slice(0, 5).join(":"), severity: "high", evidence: { count: sessionSignals.impossibleSessionIds.length, sessionIds: sessionSignals.impossibleSessionIds.slice(0, 10) }, detectedAt });
  }
  if (sessionSignals.simultaneous) {
    const pair = sessionSignals.overlappingPairs[0];
    await insertFlag({ userId, signalType: "simultaneous_timers", evidenceKey: pair.join(":"), severity: "high", evidence: { overlappingPairs: sessionSignals.overlappingPairs.slice(0, 10) }, detectedAt });
  }
  const rapid = detectRapidChapterCompletion(progress.results ?? []);
  if (rapid.suspicious) await insertFlag({ userId, signalType: "rapid_chapter_completion", evidenceKey: rapid.windowStart ?? "rapid", severity: "medium", evidence: rapid, detectedAt });
  const fakeTests = detectFakeTestPattern(tests.results ?? []);
  if (fakeTests.suspicious) await insertFlag({ userId, signalType: "fake_test_pattern", evidenceKey: String(fakeTests.reason ?? "tests"), severity: "high", evidence: fakeTests, detectedAt });
  const loop = detectProgressLoop(progressEvents.results ?? []);
  if (loop.suspicious) await insertFlag({ userId, signalType: "delete_reenter_xp_loop", evidenceKey: String(loop.evidenceKey ?? "loop"), severity: "medium", evidence: loop, detectedAt });
  const excessive = detectExcessiveDailyXp([...(baseXp.results ?? []), ...(bonusXp.results ?? [])]);
  for (const day of excessive.suspiciousDays) await insertFlag({ userId, signalType: "excessive_daily_xp", evidenceKey: day.day, severity: "medium", evidence: day, detectedAt });

  const active = await db().prepare("SELECT COUNT(*) AS count FROM anti_cheat_flags WHERE user_id=?1 AND status IN ('pending','upheld')").bind(userId).first<{ count: number }>();
  return {
    userId,
    activeFlagCount: Number(active?.count ?? 0),
    signals: {
      impossibleTimers: sessionSignals.impossibleSessionIds.length,
      simultaneousTimers: sessionSignals.overlappingPairs.length,
      rapidChapterCompletion: rapid.suspicious,
      fakeTestPattern: fakeTests.suspicious,
      progressLoop: loop.suspicious,
      excessiveDailyXp: excessive.suspicious,
    },
  };
}

export async function listAntiCheatFlags(status?: FlagStatus) {
  const allowed: FlagStatus[] = ["pending", "cleared", "upheld"];
  const filtered = status && allowed.includes(status) ? status : null;
  const result = filtered
    ? await db().prepare(`SELECT id,user_id,signal_type,evidence_key,severity,status,evidence,detected_at,reviewed_by,reviewed_at,review_notes
        FROM anti_cheat_flags WHERE status=?1 ORDER BY detected_at DESC LIMIT 250`).bind(filtered).all<FlagRow>()
    : await db().prepare(`SELECT id,user_id,signal_type,evidence_key,severity,status,evidence,detected_at,reviewed_by,reviewed_at,review_notes
        FROM anti_cheat_flags ORDER BY detected_at DESC LIMIT 250`).all<FlagRow>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    signalType: row.signal_type,
    severity: row.severity,
    status: row.status,
    evidence: JSON.parse(row.evidence || "{}") as Record<string, unknown>,
    detectedAt: row.detected_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
  }));
}

export async function reviewAntiCheatFlag(input: { flagId: string; actorUserId: string; decision: FlagDecision; notes?: unknown }) {
  if (!input.flagId) throw new Error("Anti-cheat flag is required.");
  const status: FlagStatus = input.decision === "clear" ? "cleared" : input.decision === "uphold" ? "upheld" : (() => { throw new Error("Review decision is invalid."); })();
  const current = await db().prepare("SELECT id,status FROM anti_cheat_flags WHERE id=?1 LIMIT 1").bind(input.flagId).first<{ id: string; status: FlagStatus }>();
  if (!current) throw new Error("Anti-cheat flag was not found.");
  const now = iso();
  await db().prepare(`UPDATE anti_cheat_flags SET status=?1,reviewed_by=?2,reviewed_at=?3,review_notes=?4,updated_at=?3 WHERE id=?5`)
    .bind(status, input.actorUserId, now, cleanReviewNotes(input.notes) || null, input.flagId).run();
  return { id: input.flagId, status, reviewedAt: now };
}

export async function isRewardEligible(userId: string) {
  const row = await db().prepare("SELECT COUNT(*) AS count FROM anti_cheat_flags WHERE user_id=?1 AND status IN ('pending','upheld')").bind(userId).first<{ count: number }>();
  return Number(row?.count ?? 0) === 0;
}

async function rewardPlans() {
  const rows = await db().prepare(`SELECT id,tier_key,name,rank,sort_order FROM subscription_plans
    WHERE active=1 AND tier_key<>'free' ORDER BY rank DESC,sort_order ASC,id ASC`).all<PlanRow>();
  const plans = rows.results ?? [];
  if (plans.length < 2) throw new Error("Phase 13 rewards require two active paid plans before settlement.");
  return { premium: plans[0], pro: plans[1] };
}

export async function settleMonthlyRewards(competitionPeriod: string, actorUserId: string, now = new Date()) {
  const window = monthWindow(competitionPeriod);
  if (new Date(window.endsAt).getTime() > now.getTime()) throw new Error("Monthly rewards can only be settled after the competition period closes.");
  await reconcileOptedInUsers(now);
  const ranked = await loadRankedEntries("overall", competitionPeriod);
  const plans = await rewardPlans();
  const rewardWindow = nextMonthRewardWindow(competitionPeriod);
  const created: Array<{ rank: number; rewardTier: RewardTier; status: string; userId: string }> = [];
  for (const entry of ranked.slice(0, 3)) {
    const reward = rewardForRank(entry.rank);
    if (!reward) continue;
    await scanAntiCheatForUser(entry.userId, now);
    const eligible = await isRewardEligible(entry.userId);
    const plan = reward.rewardTier === "premium" ? plans.premium : plans.pro;
    const status = eligible ? "scheduled" : "withheld";
    const activeFlags = await db().prepare("SELECT signal_type,status,severity FROM anti_cheat_flags WHERE user_id=?1 AND status IN ('pending','upheld') ORDER BY detected_at DESC LIMIT 20").bind(entry.userId).all<{ signal_type: string; status: string; severity: string }>();
    await db().prepare(`INSERT OR IGNORE INTO leaderboard_reward_grants(
      id,competition_period,reward_period,user_id,rank,reward_tier,plan_id,status,starts_at,ends_at,anti_cheat_snapshot,created_at,updated_at
    ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)`)
      .bind(uuid(), competitionPeriod, rewardWindow.rewardPeriod, entry.userId, entry.rank, reward.rewardTier, plan.id, status, rewardWindow.startsAt, rewardWindow.endsAt, JSON.stringify({ eligible, flags: activeFlags.results ?? [], settledBy: actorUserId }), iso(now)).run();
    created.push({ rank: entry.rank, rewardTier: reward.rewardTier, status, userId: entry.userId });
  }
  return { competitionPeriod, rewardPeriod: rewardWindow.rewardPeriod, grants: created };
}

export async function getActiveLeaderboardRewardPlan(userId: string, now = new Date()) {
  const nowValue = iso(now);
  const grant = await db().prepare(`SELECT g.id,g.plan_id,g.reward_tier,g.starts_at,g.ends_at,p.rank,p.name,p.tier_key
    FROM leaderboard_reward_grants g JOIN subscription_plans p ON p.id=g.plan_id AND p.active=1
    WHERE g.user_id=?1 AND g.status IN ('scheduled','active') AND g.starts_at<=?2 AND g.ends_at>?2
    ORDER BY p.rank DESC,g.rank ASC LIMIT 1`).bind(userId, nowValue).first<{ id: string; plan_id: string; reward_tier: RewardTier; starts_at: string; ends_at: string; rank: number; name: string; tier_key: string }>();
  if (!grant) return null;
  return { grantId: grant.id, planId: grant.plan_id, rewardTier: grant.reward_tier, startsAt: grant.starts_at, endsAt: grant.ends_at, rank: Number(grant.rank), planName: grant.name, tierKey: grant.tier_key };
}

async function syllabusCoverage(userId: string) {
  const row = await db().prepare(`SELECT COUNT(DISTINCT c.id) AS total,
      COUNT(DISTINCT CASE WHEN cp.completed_at IS NOT NULL THEN c.id END) AS completed
    FROM profiles p
    JOIN course_levels l ON lower(l.code)=lower(p.ca_level)
    JOIN attempt_syllabus_map asm ON asm.level_id=l.id AND asm.attempt_key=p.attempt_key
    JOIN course_groups g ON g.id=asm.group_id
    JOIN chapters c ON c.syllabus_version_id=asm.syllabus_version_id
    LEFT JOIN chapter_progress cp ON cp.user_id=p.user_id AND cp.chapter_id=c.id
    WHERE p.user_id=?1 AND p.onboarding_completed_at IS NOT NULL
      AND (lower(p.ca_level)='foundation' OR p.group_choice IN ('both','not_applicable') OR g.code=p.group_choice)`)
    .bind(userId).first<{ total: number; completed: number }>();
  const total = Number(row?.total ?? 0);
  const completed = Number(row?.completed ?? 0);
  return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

async function weeklySummary(userId: string, now = new Date()) {
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [xp, bonus, study] = await Promise.all([
    db().prepare("SELECT COALESCE(SUM(xp_amount),0) AS value FROM xp_ledger WHERE user_id=?1 AND occurred_at>=?2").bind(userId, from).first<{ value: number }>(),
    db().prepare("SELECT COALESCE(SUM(xp_amount),0) AS value FROM gamification_bonus_ledger WHERE user_id=?1 AND occurred_at>=?2").bind(userId, from).first<{ value: number }>(),
    db().prepare("SELECT COALESCE(SUM(duration_seconds),0) AS value FROM study_sessions WHERE user_id=?1 AND ended_at>=?2 AND duration_seconds>=1200 AND duration_seconds<?3").bind(userId, from, IMPOSSIBLE_SESSION_SECONDS).first<{ value: number }>(),
  ]);
  return { xp: Number(xp?.value ?? 0) + Number(bonus?.value ?? 0), studyMinutes: Math.floor(Number(study?.value ?? 0) / 60) };
}

async function currentRewards(userId: string) {
  const result = await db().prepare(`SELECT id,competition_period,reward_period,rank,reward_tier,plan_id,status,starts_at,ends_at
    FROM leaderboard_reward_grants WHERE user_id=?1 ORDER BY competition_period DESC,rank ASC LIMIT 12`).bind(userId).all<RewardGrantRow>();
  return (result.results ?? []).map((row) => ({ id: row.id, competitionPeriod: row.competition_period, rewardPeriod: row.reward_period, rank: row.rank, rewardTier: row.reward_tier, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at }));
}

async function outgoingReferrals(userId: string) {
  const result = await db().prepare(`SELECT status,qualifying_session_count,joined_at,activated_at FROM referrals
    WHERE referrer_user_id=?1 ORDER BY created_at DESC LIMIT 50`).bind(userId).all<{ status: string; qualifying_session_count: number; joined_at: string; activated_at: string | null }>();
  const rows = result.results ?? [];
  return {
    total: rows.length,
    activated: rows.filter((row) => row.status === "activated").length,
    pending: rows.filter((row) => row.status === "pending").length,
  };
}

export async function getPhase13UserModel(userId: string, now = new Date(), existingSummary?: GamificationSummary) {
  await reconcileReferralActivation(userId);
  const [base, bonus, preference, referralCode, inbound, outgoing, coverage, week, rewards] = await Promise.all([
    existingSummary ?? getGamificationSummary(userId, now),
    db().prepare("SELECT COALESCE(SUM(xp_amount),0) AS value FROM gamification_bonus_ledger WHERE user_id=?1").bind(userId).first<{ value: number }>(),
    currentLeaderboardPreference(userId),
    ensureReferralCode(userId),
    db().prepare("SELECT status,qualifying_session_count FROM referrals WHERE referred_user_id=?1 LIMIT 1").bind(userId).first<{ status: string; qualifying_session_count: number }>(),
    outgoingReferrals(userId),
    syllabusCoverage(userId),
    weeklySummary(userId, now),
    currentRewards(userId),
  ]);
  const bonusXp = Number(bonus?.value ?? 0);
  const effectiveTotalXp = base.totalXp + bonusXp;
  const effectiveLevel = levelForXp(effectiveTotalXp);
  let rank: number | null = null;
  if (preference.optedIn) {
    const ranked = await loadRankedEntries("overall", monthPeriodKey(now));
    rank = ranked.find((entry) => entry.userId === userId)?.rank ?? null;
  }
  const cards: ShareCard[] = [
    publicShareCard({ kind: "weekly", title: "My CA Progress week", primary: `${week.xp.toLocaleString()} XP this week`, secondary: `${week.studyMinutes} meaningful study minutes recorded` }),
    publicShareCard({ kind: "milestone", title: "CA Progress milestone", primary: `${effectiveTotalXp.toLocaleString()} total XP`, secondary: effectiveLevel.name }),
    publicShareCard({ kind: "syllabus", title: "Syllabus coverage", primary: `${coverage.percent}% covered`, secondary: `${coverage.completed} of ${coverage.total} applicable chapters completed` }),
  ];
  if (preference.optedIn && rank !== null) cards.push(publicShareCard({ kind: "leaderboard", title: "Monthly leaderboard", primary: `Rank #${rank}`, secondary: `${monthPeriodKey(now)} · ${effectiveLevel.name}` }));
  return {
    effectiveTotalXp,
    bonusXp,
    effectiveLevel,
    leaderboard: { optedIn: preference.optedIn, publicAlias: preference.publicAlias, category: "overall" as const, period: monthPeriodKey(now), rank },
    referral: { code: referralCode, activationRequiredSessions: 3, activationXp: REFERRAL_ACTIVATION_XP, inbound: inbound ? { status: inbound.status, qualifyingSessionCount: Number(inbound.qualifying_session_count) } : null, outgoing },
    rewards,
    shareCards: cards,
  };
}
