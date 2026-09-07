import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Loading from "./loading";
import { LoginRequired } from "@/components/auth/login-required";
import { Phase13Panel } from "@/components/gamification/phase13-panel";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { optionalUser } from "@/lib/auth/server";
import { getPhase13UserModel } from "@/lib/gamification/phase13-service";
import { getGamificationSummary } from "@/lib/gamification/service";
import { getActivityPageModel } from "@/lib/planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity | CA Progress" };

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

type ActivitySearchParams = { ref?: string | string[] };

function cleanReferralCode(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return /^[A-Z0-9]{8,32}$/.test(code) ? code : "";
}

export default async function ActivityPage({ searchParams }: { searchParams?: Promise<ActivitySearchParams> }) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialReferralCode = cleanReferralCode(resolvedSearchParams.ref);
  return <Suspense fallback={<Loading />}><ActivityContent initialReferralCode={initialReferralCode}/></Suspense>;
}

async function ActivityContent({ initialReferralCode }: { initialReferralCode: string }) {
  const [modelResult, userResult] = await Promise.allSettled([getActivityPageModel(), optionalUser()]);
  const user = userResult.status === "fulfilled" ? userResult.value : null;
  const model = modelResult.status === "fulfilled" ? modelResult.value : user ? { mode: "ready" as const, viewerName: "Student", items: [] } : { mode: "guest" as const };
  const timelineUnavailable = modelResult.status === "rejected";
  const nextPath = initialReferralCode ? `/activity?ref=${encodeURIComponent(initialReferralCode)}` : "/activity";
  if (model.mode === "guest" || !user) return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Activity" title="Your study and progress history." description="Browse the activity page as a guest. Your personal timeline appears after sign-in." actions={<div className="phase6-header-links"><Link href="/study">Study</Link><Link href="/progress">Progress</Link></div>}/>
    <Card><CardBody><div className="phase6-empty"><Icon name="sparkles"/><strong>Activity preview</strong><p>There is no guest activity history. Sign in to record study and progress events.</p></div></CardBody></Card>
    <LoginRequired next={nextPath} title="Sign in to view your private activity"/>
  </div>;

  // The timeline, XP summary, and Phase 13 panel are independent. A malformed
  // legacy row or an optional subsystem failure must not blank the whole page.
  const now = new Date();
  const gamification = await getGamificationSummary(user.id, now).catch(() => null);
  const phase13 = await getPhase13UserModel(user.id, now, gamification ?? undefined).catch(() => null);
  const effectiveLevel = phase13?.effectiveLevel ?? gamification?.level ?? null;
  const effectiveTotalXp = phase13?.effectiveTotalXp ?? gamification?.totalXp ?? 0;
  const hundredHourShareCard = gamification && effectiveLevel && gamification.streak.meaningfulStudyMinutes >= 100 * 60
    ? { kind: "milestone", title: "100h study milestone", primary: "100+ meaningful study hours", secondary: effectiveLevel.name }
    : null;
  const phase13ForUi = phase13 && hundredHourShareCard
    ? { ...phase13, shareCards: [...phase13.shareCards.filter((card) => card.kind !== "milestone"), hundredHourShareCard] }
    : phase13;

  return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Activity" title="Preparation momentum and activity." description="XP, levels and achievements reward meaningful preparation only. They never change syllabus progress, revision readiness or test readiness." actions={<div className="phase6-header-links"><Link href="/study">Study</Link><Link href="/progress">Progress</Link></div>}/>

    {gamification && effectiveLevel ? <Card><CardBody>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
        <div><small>Professional level</small><h3>{effectiveLevel.name}</h3><p>{effectiveTotalXp.toLocaleString()} XP</p></div>
        <div><small>Current streak</small><h3>{gamification.streak.current} day{gamification.streak.current === 1 ? "" : "s"}</h3><p>Best: {gamification.streak.best} days</p></div>
        <div><small>Meaningful study</small><h3>{Math.floor(gamification.streak.meaningfulStudyMinutes / 60)}h {gamification.streak.meaningfulStudyMinutes % 60}m</h3><p>20+ minute sessions qualify for study-day evidence.</p></div>
        <div><small>Achievements</small><h3>{gamification.achievementCount}/{gamification.availableAchievementCount}</h3><p>{gamification.streak.todayQualified ? "Today already qualifies for your streak." : "A meaningful session or Today task can qualify today."}</p></div>
      </div>
      {effectiveLevel.nextMinXp !== null ? <p style={{ marginTop: 16 }}>{effectiveLevel.nextMinXp - effectiveTotalXp} XP to {effectiveLevel.nextName}. Level progress: {effectiveLevel.progressPercent}%.</p> : <p style={{ marginTop: 16 }}>Highest professional preparation level reached.</p>}
      <p style={{ marginTop: 8 }}><small>Streak timezone: {gamification.streak.timezone}. Historical qualifying days keep the timezone recorded by their source activity.</small></p>
    </CardBody></Card> : <Card><CardBody><div className="phase6-warning"><Icon name="sparkles"/><span><strong>XP summary is temporarily unavailable.</strong><br/><small>Your study sessions and progress records are unchanged.</small></span></div></CardBody></Card>}

    {phase13ForUi ? <Card><CardBody><Phase13Panel initial={phase13ForUi} initialReferralCode={initialReferralCode}/></CardBody></Card> : <Card><CardBody><div id="leaderboard" className="phase6-warning"><Icon name="target"/><span><strong>Leaderboard and referrals are temporarily unavailable.</strong><br/><small>Retry later; no study or account data was changed.</small></span></div></CardBody></Card>}

    {gamification ? <Card><CardBody>
      <h3>Achievements</h3>
      {gamification.achievements.length ? <div style={{ display: "grid", gap: 10, marginTop: 12 }}>{gamification.achievements.map((achievement) => <div key={achievement.key}><strong>{achievement.title}</strong><p>{achievement.description}</p><small>Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}</small></div>)}</div> : <div className="phase6-empty"><Icon name="sparkles"/><strong>Your first achievement is ahead</strong><p>Complete a meaningful study session to begin.</p></div>}
    </CardBody></Card> : null}

    {gamification && phase13 ? <Card><CardBody>
      <h3>Recent XP</h3>
      {gamification.recentXp.length ? <div style={{ display: "grid", gap: 8, marginTop: 12 }}>{gamification.recentXp.slice(0, 8).map((entry) => <div key={`${entry.eventType}:${entry.sourceId}`} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span><strong>{xpLabel(entry.eventType)}</strong><br/><small>{new Date(entry.occurredAt).toLocaleString()}</small></span><strong>+{entry.xp} XP</strong></div>)}</div> : <p>No XP events yet.</p>}
      {phase13.bonusXp > 0 ? <p style={{ marginTop: 12 }}><small>Activation-based referral bonuses: +{phase13.bonusXp.toLocaleString()} XP. Referral XP is kept in a separate immutable bonus ledger.</small></p> : null}
    </CardBody></Card> : null}

    <Card><CardBody>{model.items.length ? <div className="phase6-activity-list">{model.items.map((item) => <Link key={item.id} href={item.href}><span className={`phase6-activity-icon phase6-activity-icon--${item.source}`}><Icon name={item.source === "study" ? "timer" : "chart"}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><time>{new Date(item.occurredAt).toLocaleString()}</time><Icon name="chevron" size={16}/></Link>)}</div> : <div className="phase6-empty"><Icon name="sparkles"/><strong>{timelineUnavailable ? "Activity timeline is temporarily unavailable" : "No activity yet"}</strong><p>{timelineUnavailable ? "Your source study and progress records are safe. Retry this page to load the timeline." : "Finish a study timer or update chapter progress and it will appear here automatically."}</p></div>}</CardBody></Card>
  </div>;
}
