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

export default function ActivityPage() {
  return <Suspense fallback={<Loading />}><ActivityContent /></Suspense>;
}

async function ActivityContent() {
  const [model, user] = await Promise.all([getActivityPageModel(), optionalUser()]);
  if (model.mode === "guest" || !user) return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Activity" title="Your study and progress history." description="Browse the activity page as a guest. Your personal timeline appears after sign-in." actions={<div className="phase6-header-links"><Link href="/study">Study</Link><Link href="/progress">Progress</Link></div>}/>
    <Card><CardBody><div className="phase6-empty"><Icon name="sparkles"/><strong>Activity preview</strong><p>There is no guest activity history. Sign in to record study and progress events.</p></div></CardBody></Card>
    <LoginRequired next="/activity" title="Sign in to view your private activity"/>
  </div>;

  const [gamification, phase13] = await Promise.all([getGamificationSummary(user.id), getPhase13UserModel(user.id)]);
  const effectiveLevel = phase13.effectiveLevel;
  const effectiveTotalXp = phase13.effectiveTotalXp;
  return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Activity" title="Preparation momentum and activity." description="XP, levels and achievements reward meaningful preparation only. They never change syllabus progress, revision readiness or test readiness." actions={<div className="phase6-header-links"><Link href="/study">Study</Link><Link href="/progress">Progress</Link></div>}/>

    <Card><CardBody>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
        <div><small>Professional level</small><h3>{effectiveLevel.name}</h3><p>{effectiveTotalXp.toLocaleString()} XP</p></div>
        <div><small>Current streak</small><h3>{gamification.streak.current} day{gamification.streak.current === 1 ? "" : "s"}</h3><p>Best: {gamification.streak.best} days</p></div>
        <div><small>Meaningful study</small><h3>{Math.floor(gamification.streak.meaningfulStudyMinutes / 60)}h {gamification.streak.meaningfulStudyMinutes % 60}m</h3><p>20+ minute sessions qualify for study-day evidence.</p></div>
        <div><small>Achievements</small><h3>{gamification.achievementCount}/{gamification.availableAchievementCount}</h3><p>{gamification.streak.todayQualified ? "Today already qualifies for your streak." : "A meaningful session or Today task can qualify today."}</p></div>
      </div>
      {effectiveLevel.nextMinXp !== null ? <p style={{ marginTop: 16 }}>{effectiveLevel.nextMinXp - effectiveTotalXp} XP to {effectiveLevel.nextName}. Level progress: {effectiveLevel.progressPercent}%.</p> : <p style={{ marginTop: 16 }}>Highest professional preparation level reached.</p>}
      <p style={{ marginTop: 8 }}><small>Streak timezone: {gamification.streak.timezone}. Historical qualifying days keep the timezone recorded by their source activity.</small></p>
    </CardBody></Card>

    <Card><CardBody><Phase13Panel initial={phase13}/></CardBody></Card>

    <Card><CardBody>
      <h3>Achievements</h3>
      {gamification.achievements.length ? <div style={{ display: "grid", gap: 10, marginTop: 12 }}>{gamification.achievements.map((achievement) => <div key={achievement.key}><strong>{achievement.title}</strong><p>{achievement.description}</p><small>Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}</small></div>)}</div> : <div className="phase6-empty"><Icon name="sparkles"/><strong>Your first achievement is ahead</strong><p>Complete a meaningful study session to begin.</p></div>}
    </CardBody></Card>

    <Card><CardBody>
      <h3>Recent XP</h3>
      {gamification.recentXp.length ? <div style={{ display: "grid", gap: 8, marginTop: 12 }}>{gamification.recentXp.slice(0, 8).map((entry) => <div key={`${entry.eventType}:${entry.sourceId}`} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span><strong>{xpLabel(entry.eventType)}</strong><br/><small>{new Date(entry.occurredAt).toLocaleString()}</small></span><strong>+{entry.xp} XP</strong></div>)}</div> : <p>No XP events yet.</p>}
      {phase13.bonusXp > 0 ? <p style={{ marginTop: 12 }}><small>Activation-based referral bonuses: +{phase13.bonusXp.toLocaleString()} XP. Referral XP is kept in a separate immutable bonus ledger.</small></p> : null}
    </CardBody></Card>

    <Card><CardBody>{model.items.length ? <div className="phase6-activity-list">{model.items.map((item) => <Link key={item.id} href={item.href}><span className={`phase6-activity-icon phase6-activity-icon--${item.source}`}><Icon name={item.source === "study" ? "timer" : "chart"}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><time>{new Date(item.occurredAt).toLocaleString()}</time><Icon name="chevron" size={16}/></Link>)}</div> : <div className="phase6-empty"><Icon name="sparkles"/><strong>No activity yet</strong><p>Finish a study timer or update chapter progress and it will appear here automatically.</p></div>}</CardBody></Card>
  </div>;
}
