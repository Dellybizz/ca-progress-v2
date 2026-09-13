import type { Metadata } from "next";
import Link from "next/link";
import { Phase9ActionableAnalytics } from "@/components/analytics/phase9-actionable";
import { LoginRequired } from "@/components/auth/login-required";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getPhase9AnalyticsModel } from "@/lib/analytics/phase9";
import { optionalUser } from "@/lib/auth/server";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";
import { getCurrentPhase8Snapshot } from "@/lib/planner/phase8";
import { getProgressPageModel } from "@/lib/progress/service";
import { getStudyPageModel } from "@/lib/study/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics | CA Progress" };

function Meter({ value }: { value: number }) {
  return <div className="analytics-meter" aria-label={`${value}%`}><span style={{ width: `${value}%` }}/></div>;
}

function studyTime(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default async function AnalyticsPage() {
  const identity = await optionalUser();
  const [model, study, planning, phase9, advancedAnalytics] = await Promise.all([
    getProgressPageModel(),
    getStudyPageModel(),
    getCurrentPhase8Snapshot(),
    getPhase9AnalyticsModel(),
    identity ? getPlanFeatureAccessForUser(identity.id, "advanced_analytics") : Promise.resolve(null),
  ]);

  if (model.mode === "guest") return <div className="progress-page">
    <PageHeader preview={false} eyebrow="Analytics" title="Study and progress analytics." description="Browse the analytics layout as a guest. Personal insights are available only after sign-in and only when your own recorded evidence supports them." actions={<div className="phase6-header-links"><Link href="/study">Study</Link><Link href="/progress">Progress</Link></div>}/>
    <Card><CardBody><div className="phase6-empty"><Icon name="chart"/><strong>Analytics preview</strong><p>Guest mode does not create personal analytics or forecasts.</p></div></CardBody></Card>
    <LoginRequired next="/analytics" title="Sign in to view private analytics"/>
  </div>;

  if (model.mode === "setup") return <div className="progress-page">
    <PageHeader preview={false} eyebrow="Analytics" title="Complete your academic profile first." description="Analytics are scoped to your applicable chapters, verified attempt and completed student activity."/>
    <Link className="ui-button ui-button--primary" href="/settings/profile">Review profile</Link>
  </div>;

  const studyAnalytics = study.mode === "ready" ? study.analytics : null;
  const analytics = model.analytics;

  return <div className="progress-page analytics-page">
    <PageHeader
      preview={false}
      eyebrow="Analytics"
      title="Actionable analytics from your recorded study data."
      description={`${model.levelName} · ${model.groupLabel} · ${model.attemptKey}. Core analytics remain available on Free. Pro adds the deeper weakness, revision, consistency and test-insight analysis. No manually maintained totals are used, and XP is never treated as readiness.`}
      actions={<div className="phase6-header-links"><Link href="/study">Study</Link><Link href="/progress">Progress</Link><Link href="/analytics/forecast">Forecast</Link></div>}
    />

    {phase9.mode === "ready" ? advancedAnalytics?.allowed ? <Phase9ActionableAnalytics model={phase9}/> : <Card>
      <CardHeader title="Advanced analytics · Pro" description="Weakness, revision, consistency and test-insight analysis is a Pro capability. Your core analytics and baseline forecast remain available below and in Forecast."/>
      <CardBody><Link href="/pricing" className="ui-button ui-button--primary">Compare plans</Link></CardBody>
    </Card> : null}

    {studyAnalytics ? <>
      <section className="phase6-metric-strip">
        <Card><CardBody><Icon name="clock"/><span><strong>{studyTime(studyAnalytics.todaySeconds)}</strong><small>studied today</small></span></CardBody></Card>
        <Card><CardBody><Icon name="timer"/><span><strong>{studyTime(studyAnalytics.last7DaysSeconds)}</strong><small>last 7 days</small></span></CardBody></Card>
        <Card><CardBody><Icon name="sparkles"/><span><strong>{studyAnalytics.streakDays}</strong><small>day streak</small></span></CardBody></Card>
        <Card><CardBody><Icon name="chart"/><span><strong>{studyAnalytics.sessionCountLast7Days}</strong><small>sessions / 7 days</small></span></CardBody></Card>
      </section>
      <Card>
        <CardHeader title="Recent study sessions" description="Finishing the Study timer inserts a study_session row; this panel reads those normalized rows directly." action={<Badge tone="brand">Live source</Badge>}/>
        <CardBody>{studyAnalytics.recentSessions.length ? <div className="phase6-session-list">{studyAnalytics.recentSessions.slice(0, 6).map((session) => <div key={session.id}><span><strong>{session.chapterTitle ?? session.subjectTitle ?? "General study"}</strong><small>{new Date(session.endedAt).toLocaleString()}</small></span><b>{studyTime(session.durationSeconds)}</b></div>)}</div> : <EmptyState compact icon="timer" title="No completed study sessions yet" description="Finish a Study timer and your analytics will update from the new database row."/>}</CardBody>
      </Card>
    </> : null}

    {planning ? <Card>
      <CardHeader title="Goal progress" description="These values use the same recorded-state goal calculation shown in Planner and Today." action={<Badge tone="brand">Recorded state</Badge>}/>
      <CardBody>{planning.goals.length ? <div className="analytics-list">{planning.goals.map((goal) => <div key={goal.id}><span><strong>{goal.title}</strong><small>{goal.currentValue}/{goal.targetValue} {goal.targetUnit} · due {goal.dueDate}</small></span><b>{goal.progressPercent}%</b><Meter value={goal.progressPercent}/></div>)}</div> : <EmptyState compact icon="target" title="No goals yet" description="Add a measurable study, completion, revision or test goal to track it here and in Today."/>}</CardBody>
    </Card> : null}

    {!model.chapters.length ? <EmptyState icon="chart" title="Nothing to analyse yet for chapter progress" description="Study analytics can still exist, but chapter-stage analytics require an applicable verified syllabus." action={<Link className="ui-button ui-button--primary" href="/settings/profile">Review academic profile</Link>}/> : <>
      <section className="analytics-hero-grid">
        <Card><CardBody><span>Overall stage progress</span><strong>{analytics.overallPercent}%</strong><Meter value={analytics.overallPercent}/><small>Completed + revisions + tests across {analytics.chapterCount} chapters</small></CardBody></Card>
        <Card><CardBody><span>Completion</span><strong>{analytics.completionPercent}%</strong><Meter value={analytics.completionPercent}/><small>{analytics.completedCount} chapters completed</small></CardBody></Card>
        <Card><CardBody><span>Revision coverage</span><strong>{analytics.revisionPercent}%</strong><Meter value={analytics.revisionPercent}/><small>{analytics.revision1Count} first · {analytics.revision2Count} second revisions</small></CardBody></Card>
        <Card><CardBody><span>Test coverage</span><strong>{analytics.testPercent}%</strong><Meter value={analytics.testPercent}/><small>{analytics.test1Count} Test 1 · {analytics.test2Count} Test 2</small></CardBody></Card>
      </section>
      <section className="analytics-grid">
        <Card><CardHeader title="Progress actions this week" description="Derived from accepted progress events, excluding changes later undone." action={<Badge tone="brand">7 days</Badge>}/><CardBody><div className="analytics-consistency"><div><Icon name="sparkles"/><strong>{analytics.stagesAddedLast7Days}</strong><span>stages added</span></div><div><Icon name="calendar"/><strong>{analytics.activeDaysLast7Days}</strong><span>active days</span></div></div></CardBody></Card>
        <Card><CardHeader title="Group progress" description="Aggregated directly from applicable chapter rows."/><CardBody><div className="analytics-list">{analytics.groups.map((group) => <div key={group.code}><span><strong>{group.name}</strong><small>{group.completedCount}/{group.chapterCount} chapters completed</small></span><b>{group.overallPercent}%</b><Meter value={group.overallPercent}/></div>)}</div></CardBody></Card>
      </section>
      <Card><CardHeader title="Subject progress" description="Completion, revision and test coverage by applicable subject."/><CardBody><div className="analytics-subject-table">{analytics.subjects.map((subject) => <Link key={subject.id} href={`/subjects/${subject.slug}/progress`}><span><strong>{subject.title}</strong><small>{subject.groupName} · {subject.chapterCount} chapters</small></span><span><em>Done {subject.completionPercent}%</em><em>Rev {subject.revisionPercent}%</em><em>Tests {subject.testPercent}%</em></span><b>{subject.overallPercent}%</b><Icon name="chevron" size={16}/></Link>)}</div></CardBody></Card>
    </>}
  </div>;
}
