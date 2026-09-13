"use client";

import { useEffect, useState } from "react";
import { Phase13Panel } from "@/components/gamification/phase13-panel";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

type Level = {
  name: string;
  nextMinXp: number | null;
  nextName: string | null;
  progressPercent: number;
};

type GamificationSummary = {
  totalXp: number;
  level: Level;
  streak: {
    current: number;
    best: number;
    todayQualified: boolean;
    timezone: string;
    meaningfulStudyMinutes: number;
  };
  achievements: Array<{ key: string; title: string; description: string; unlockedAt: string }>;
  achievementCount: number;
  availableAchievementCount: number;
  recentXp: Array<{ eventType: string; xp: number; occurredAt: string; sourceId: string }>;
};

type Reward = { id: string; competitionPeriod: string; rewardPeriod: string; rank: number; rewardTier: "premium" | "pro"; status: string; startsAt: string; endsAt: string };
type ShareCard = { kind: string; title: string; primary: string; secondary: string };
type Phase13Model = {
  effectiveTotalXp: number;
  bonusXp: number;
  effectiveLevel: Level;
  leaderboard: { optedIn: boolean; publicAlias: string; category: "overall"; period: string; rank: number | null };
  referral: {
    code: string;
    activationRequiredSessions: number;
    activationXp: number;
    inbound: { status: string; qualifyingSessionCount: number } | null;
    outgoing: { total: number; activated: number; pending: number };
  };
  rewards: Reward[];
  shareCards: ShareCard[];
};

type SummaryResponse = { ok?: boolean; error?: string; summary?: GamificationSummary };
type Phase13Response = { ok?: boolean; error?: string; model?: Phase13Model };

const xpLabel = (eventType: string) => ({
  valid_session: "Meaningful study session",
  today_task: "Today task completed",
  chapter_completion: "Chapter first coverage",
  revision_1: "Revision 1 completed",
  revision_2: "Revision 2 completed",
  test: "Test milestone",
  daily_goal: "Daily study goal",
  weekly_goal: "Weekly study goal",
  reflection: "Session reflection",
  resolved_doubt: "Doubt resolved",
  study_together: "Valid Study Together completion",
}[eventType] ?? "Preparation activity");

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeDate(value: unknown) {
  const date = new Date(typeof value === "string" ? value : "");
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Recorded activity";
}

export function ActivityGamificationClient({ initialReferralCode = "" }: { initialReferralCode?: string }) {
  const [summary, setSummary] = useState<GamificationSummary | null>(null);
  const [phase13, setPhase13] = useState<Phase13Model | null>(null);
  const [summaryPending, setSummaryPending] = useState(true);
  const [phase13Pending, setPhase13Pending] = useState(true);

  useEffect(() => {
    let active = true;

    void fetch("/api/gamification", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as SummaryResponse;
        if (!response.ok || !payload.ok || !payload.summary) throw new Error(payload.error || "Gamification summary could not be loaded.");
        if (active) setSummary(payload.summary);
      })
      .catch(() => { if (active) setSummary(null); })
      .finally(() => { if (active) setSummaryPending(false); });

    void fetch("/api/gamification/phase13", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as Phase13Response;
        if (!response.ok || !payload.ok || !payload.model) throw new Error(payload.error || "Leaderboard data could not be loaded.");
        if (active) setPhase13(payload.model);
      })
      .catch(() => { if (active) setPhase13(null); })
      .finally(() => { if (active) setPhase13Pending(false); });

    return () => { active = false; };
  }, []);

  const effectiveLevel = phase13?.effectiveLevel ?? summary?.level ?? null;
  const effectiveTotalXp = finite(phase13?.effectiveTotalXp ?? summary?.totalXp ?? 0);
  const meaningfulMinutes = finite(summary?.streak?.meaningfulStudyMinutes);
  const hundredHourShareCard = effectiveLevel && meaningfulMinutes >= 100 * 60
    ? { kind: "milestone", title: "100h study milestone", primary: "100+ meaningful study hours", secondary: effectiveLevel.name }
    : null;
  const phase13ForUi = phase13 && hundredHourShareCard
    ? { ...phase13, shareCards: [...(Array.isArray(phase13.shareCards) ? phase13.shareCards.filter((card) => card.kind !== "milestone") : []), hundredHourShareCard] }
    : phase13;

  return <>
    {summaryPending ? <Card><CardBody><div className="phase6-empty"><Icon name="sparkles"/><strong>Loading preparation momentum…</strong><p>Your Activity timeline remains available while XP is loaded separately.</p></div></CardBody></Card> : summary && effectiveLevel ? <Card><CardBody>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
        <div><small>Professional level</small><h3>{effectiveLevel.name}</h3><p>{effectiveTotalXp.toLocaleString()} XP</p></div>
        <div><small>Current streak</small><h3>{finite(summary.streak?.current)} day{finite(summary.streak?.current) === 1 ? "" : "s"}</h3><p>Best: {finite(summary.streak?.best)} days</p></div>
        <div><small>Meaningful study</small><h3>{Math.floor(meaningfulMinutes / 60)}h {meaningfulMinutes % 60}m</h3><p>20+ minute sessions qualify for study-day evidence.</p></div>
        <div><small>Achievements</small><h3>{finite(summary.achievementCount)}/{finite(summary.availableAchievementCount)}</h3><p>{summary.streak?.todayQualified ? "Today already qualifies for your streak." : "A meaningful session or Today task can qualify today."}</p></div>
      </div>
      {effectiveLevel.nextMinXp !== null ? <p style={{ marginTop: 16 }}>{Math.max(0, finite(effectiveLevel.nextMinXp) - effectiveTotalXp)} XP to {effectiveLevel.nextName ?? "the next level"}. Level progress: {finite(effectiveLevel.progressPercent)}%.</p> : <p style={{ marginTop: 16 }}>Highest professional preparation level reached.</p>}
      <p style={{ marginTop: 8 }}><small>Streak timezone: {summary.streak?.timezone || "Asia/Kolkata"}. Historical qualifying days keep the timezone recorded by their source activity.</small></p>
    </CardBody></Card> : <Card><CardBody><div className="phase6-warning"><Icon name="sparkles"/><span><strong>XP summary is temporarily unavailable.</strong><br/><small>Your study sessions and progress records are unchanged.</small></span></div></CardBody></Card>}

    {phase13Pending ? <Card><CardBody><div id="leaderboard" className="phase6-empty"><Icon name="target"/><strong>Loading leaderboard and referrals…</strong><p>This section is isolated so it cannot block Activity.</p></div></CardBody></Card> : phase13ForUi ? <Card><CardBody><Phase13Panel initial={phase13ForUi} initialReferralCode={initialReferralCode}/></CardBody></Card> : <Card><CardBody><div id="leaderboard" className="phase6-warning"><Icon name="target"/><span><strong>Leaderboard and referrals are temporarily unavailable.</strong><br/><small>Retry later; no study or account data was changed.</small></span></div></CardBody></Card>}

    {summary ? <Card><CardBody>
      <h3>Achievements</h3>
      {Array.isArray(summary.achievements) && summary.achievements.length ? <div style={{ display: "grid", gap: 10, marginTop: 12 }}>{summary.achievements.map((achievement) => <div key={achievement.key}><strong>{achievement.title}</strong><p>{achievement.description}</p><small>Unlocked {safeDate(achievement.unlockedAt)}</small></div>)}</div> : <div className="phase6-empty"><Icon name="sparkles"/><strong>Your first achievement is ahead</strong><p>Complete a meaningful study session to begin.</p></div>}
    </CardBody></Card> : null}

    {summary ? <Card><CardBody>
      <h3>Recent XP</h3>
      {Array.isArray(summary.recentXp) && summary.recentXp.length ? <div style={{ display: "grid", gap: 8, marginTop: 12 }}>{summary.recentXp.slice(0, 8).map((entry, index) => <div key={`${entry.eventType}:${entry.sourceId}:${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span><strong>{xpLabel(entry.eventType)}</strong><br/><small>{safeDate(entry.occurredAt)}</small></span><strong>+{finite(entry.xp)} XP</strong></div>)}</div> : <p>No XP events yet.</p>}
      {phase13 && finite(phase13.bonusXp) > 0 ? <p style={{ marginTop: 12 }}><small>Activation-based referral bonuses: +{finite(phase13.bonusXp).toLocaleString()} XP. Referral XP is kept in a separate immutable bonus ledger.</small></p> : null}
    </CardBody></Card> : null}
  </>;
}
