import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { NotificationCenter } from "@/components/planner/notification-center";
import { TodayPlanClient } from "@/components/planner/today-plan-client";
import { WeekSummaryShare } from "@/components/planner/week-summary-share";
import { PlanningNav } from "@/components/planner/planning-nav";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentPhase8Snapshot } from "@/lib/planner/phase8";
import { getPhase8TodayModel } from "@/lib/planner/phase8-today";
import { getTodayPlanPageModel } from "@/lib/smart-planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today | CA Progress" };

function formatPlanDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default async function TodayPlanPage() {
  // The canonical plan is the required product surface. Display enrichments,
  // reflection prompts and Phase 8 extras must never be able to blank Today.
  const [model, planning] = await Promise.all([
    getPhase8TodayModel().catch(async (error) => {
      console.error("[today] enriched display model unavailable; using canonical plan", error);
      return getTodayPlanPageModel();
    }),
    getCurrentPhase8Snapshot().catch((error) => {
      console.error("[today] planning snapshot unavailable", error);
      return null;
    }),
  ]);

  if (model.mode === "guest") return <div className="phase9-page"><PageHeader preview={false} eyebrow="Today" title="Today’s study plan" description="Sign in to build Today from your selected attempt and real study state."/><Card><CardBody><div className="phase6-empty"><Icon name="calendar"/><strong>Today is ready after sign-in</strong><p>The signed-in plan uses your selected attempt and recorded work. CA Progress does not invent historical performance for a new account.</p></div></CardBody></Card><LoginRequired next="/planner/today" title="Sign in to open Today"/></div>;
  if (model.mode === "setup") return <div className="phase9-page"><PageHeader preview={false} eyebrow="Today" title="Finish the quick setup first." description="Choose your CA level, group, attempt and current preparation state. Detailed progress can be added later."/><Link href="/onboarding?next=%2Fplanner%2Ftoday" className="ui-button ui-button--primary">Continue setup</Link></div>;

  const enriched = "evidenceMode" in model;
  const completedStudyMinutes = enriched ? model.completedStudyMinutes : 0;
  const evidenceMode = enriched ? model.evidenceMode : null;
  const firstWeek = enriched ? model.firstWeek : null;
  const daysRemaining = planning?.countdown.daysRemaining ?? null;
  const countdownNote = planning?.countdown.anchorDate ? `to ${planning.countdown.attemptLabel ?? "selected attempt"}` : "verified date unavailable";
  const countdownValue = planning?.countdown.periodStatus === "exam_period" ? "Exam period" : planning?.countdown.periodStatus === "completed" ? "Exam completed" : daysRemaining ?? "—";
  const activeGoals = planning?.goals.filter((goal) => goal.status === "active").slice(0, 3) ?? [];

  return <div className="phase9-page today-plan-page a2-planning-page">
    <PlanningNav current="today"/>
    <div className="today-day-heading">
      <PageHeader preview={false} eyebrow="Today" title="Your day" description={`${formatPlanDate(model.planDate)} · ${model.forecast.attemptLabel}`}/>
      <div className="button-row today-primary-actions" aria-label="Today actions"><Link href="/study" className="ui-button ui-button--primary"><Icon name="timer" size={16}/>Start Focus</Link><Link href="/planner?create=1" className="ui-button ui-button--secondary"><Icon name="plus" size={16}/>Add Task</Link></div>
    </div>
    <section className="today-day-overview" aria-label="Today overview">
      <div className="today-day-overview__copy"><small>Planned study</small><strong>{model.plannedMinutes} of {model.targetMinutes} minutes</strong><span>Completed today · {completedStudyMinutes} minutes</span></div>
      <div className="today-day-overview__track" aria-label={`${Math.min(100, Math.round((model.plannedMinutes / Math.max(1, model.targetMinutes)) * 100))}% of daily target planned`}><span style={{ width: `${Math.min(100, Math.round((model.plannedMinutes / Math.max(1, model.targetMinutes)) * 100))}%` }}/></div>
      <div className="today-day-overview__exam"><span>{planning?.countdown.periodStatus === "upcoming" ? "Days remaining" : "Exam"}</span><strong>{countdownValue}</strong><small>{countdownNote}</small></div>
    </section>
    {planning && planning.countdown.periodStatus === "upcoming" && planning.countdown.milestone !== "normal" && planning.countdown.milestone !== "unavailable" ? <Card><CardBody><div className="phase9-warning"><Icon name="calendar" size={17}/><span><strong>{planning.countdown.milestone === "today" ? "Attempt day" : `${planning.countdown.milestone}-day countdown state`}:</strong> keep fixed commitments visible and use flexible study work around them.</span></div></CardBody></Card> : null}
    {evidenceMode === "starter" ? <Card><CardBody><div className="phase9-warning"><Icon name="book" size={17}/><span><strong>Starter Today:</strong> this list is based on your selected attempt, unfinished syllabus and explicit planner items. CA Progress will not call a subject weak until recorded study or progress evidence exists.</span></div></CardBody></Card> : null}
    {!enriched ? <Card><CardBody><div className="phase9-warning"><Icon name="sparkles" size={17}/><span><strong>Today is running in core mode.</strong> Optional timing, evidence and history enrichments are temporarily unavailable, but your canonical plan and actions remain usable.</span></div></CardBody></Card> : null}
    <nav className="today-secondary-actions" aria-label="Planning shortcuts"><Link href="#study-order">Rearrange</Link><Link href="/planner">View Full Planner</Link></nav>
    {activeGoals.length ? <Card><CardHeader title="Active goals" description="These are the same recorded goal values shown in Goals and Analytics."/><CardBody><div className="phase6-goal-list">{activeGoals.map((goal) => <article className="phase6-goal" key={goal.id}><div><strong>{goal.title}</strong><p>{goal.currentValue}/{goal.targetValue} {goal.targetUnit} · {goal.progressPercent}%</p></div></article>)}</div><Link href="/goals" className="ui-text-link">Open goals</Link></CardBody></Card> : null}
    {planning ? <NotificationCenter notifications={planning.notifications} preferences={planning.notificationPreferences} compact/> : null}
    {firstWeek ? <Card><CardHeader title={firstWeek.title}/><CardBody><p>{firstWeek.body}</p><div className="button-row">{firstWeek.primaryHref && firstWeek.primaryLabel ? <Link href={firstWeek.primaryHref} className="ui-button ui-button--primary">{firstWeek.primaryLabel}</Link> : null}{firstWeek.secondaryHref && firstWeek.secondaryLabel ? <Link href={firstWeek.secondaryHref} className="ui-button ui-button--secondary">{firstWeek.secondaryLabel}</Link> : null}{firstWeek.shareText ? <WeekSummaryShare text={firstWeek.shareText}/> : null}</div></CardBody></Card> : null}
    <div id="study-order"><TodayPlanClient model={model}/></div>
  </div>;
}
