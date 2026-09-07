import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { NotificationCenter } from "@/components/planner/notification-center";
import { TodayPlanClient } from "@/components/planner/today-plan-client";
import { WeekSummaryShare } from "@/components/planner/week-summary-share";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentPhase8Snapshot } from "@/lib/planner/phase8";
import { getPhase8TodayModel } from "@/lib/planner/phase8-today";
import { getPendingStudyReflectionPrompt } from "@/lib/study/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today | CA Progress" };

function formatPlanDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default async function TodayPlanPage() {
  const [model, pendingReflection, planning] = await Promise.all([
    getPhase8TodayModel(),
    getPendingStudyReflectionPrompt().catch(() => null),
    getCurrentPhase8Snapshot().catch(() => null),
  ]);
  if (model.mode === "guest") return <div className="phase9-page"><PageHeader preview={false} eyebrow="Today" title="Today’s study plan" description="Sign in to build Today from your selected attempt and real study state."/><Card><CardBody><div className="phase6-empty"><Icon name="calendar"/><strong>Today is ready after sign-in</strong><p>The signed-in plan uses your selected attempt and recorded work. CA Progress does not invent historical performance for a new account.</p></div></CardBody></Card><LoginRequired next="/planner/today" title="Sign in to open Today"/></div>;
  if (model.mode === "setup") return <div className="phase9-page"><PageHeader preview={false} eyebrow="Today" title="Finish the quick setup first." description="Choose your CA level, group, attempt and current preparation state. Detailed progress can be added later."/><Link href="/onboarding?next=%2Fplanner%2Ftoday" className="ui-button ui-button--primary">Continue setup</Link></div>;
  if (!("evidenceMode" in model)) throw new Error("Today display model is incomplete.");

  const daysRemaining = planning?.countdown.daysRemaining ?? null;
  const countdownNote = planning?.countdown.anchorDate ? `to ${planning.countdown.attemptLabel ?? "selected attempt"}` : "verified date unavailable";
  const activeGoals = planning?.goals.filter((goal) => goal.status === "active").slice(0, 3) ?? [];

  return <div className="phase9-page today-plan-page">
    <PageHeader preview={false} eyebrow="Today" title="Today’s study plan" description={`${formatPlanDate(model.planDate)} · ${model.forecast.attemptLabel}`}/>
    <section className="phase9-metrics" aria-label="Today overview"><Card><CardBody><Icon name="calendar"/><div><span>Days remaining</span><strong>{daysRemaining ?? "—"}</strong><small>{countdownNote}</small></div></CardBody></Card><Card><CardBody><Icon name="target"/><div><span>Planned study</span><strong>{model.plannedMinutes}m</strong><small>fixed and flexible work</small></div></CardBody></Card><Card><CardBody><Icon name="clock"/><div><span>Completed today</span><strong>{model.completedStudyMinutes}m</strong><small>from finished study sessions</small></div></CardBody></Card></section>
    {planning && planning.countdown.milestone !== "normal" && planning.countdown.milestone !== "unavailable" ? <Card><CardBody><div className="phase9-warning"><Icon name="calendar" size={17}/><span><strong>{planning.countdown.milestone === "today" ? "Attempt day" : `${planning.countdown.milestone}-day countdown state`}:</strong> keep fixed commitments visible and use flexible study work around them.</span></div></CardBody></Card> : null}
    {pendingReflection ? <Card><CardHeader title="Reflect on your finished session" description="One quick self-report keeps study history meaningful."/><CardBody><p>Your recent {Math.max(1, Math.round(pendingReflection.duration_seconds / 60))}-minute session is ready for understanding, focus and an optional doubt.</p><Link href={`/study?reflect=${encodeURIComponent(pendingReflection.id)}`} className="ui-button ui-button--primary">Add reflection</Link></CardBody></Card> : null}
    {model.evidenceMode === "starter" ? <Card><CardBody><div className="phase9-warning"><Icon name="book" size={17}/><span><strong>Starter Today:</strong> this list is based on your selected attempt, unfinished syllabus and explicit planner items. CA Progress will not call a subject weak until recorded study or progress evidence exists.</span></div></CardBody></Card> : null}
    <div className="button-row" aria-label="Today actions"><Link href="/study" className="ui-button ui-button--primary">Start Study</Link><Link href="#study-order" className="ui-button ui-button--secondary">Rearrange</Link><Link href="/planner" className="ui-button ui-button--secondary">Add Task</Link><Link href="/planner" className="ui-button ui-button--secondary">View Full Planner</Link></div>
    {activeGoals.length ? <Card><CardHeader title="Active goals" description="These are the same recorded goal values shown in Goals and Analytics."/><CardBody><div className="phase6-goal-list">{activeGoals.map((goal) => <article className="phase6-goal" key={goal.id}><div><strong>{goal.title}</strong><p>{goal.currentValue}/{goal.targetValue} {goal.targetUnit} · {goal.progressPercent}%</p></div></article>)}</div><Link href="/goals" className="ui-text-link">Open goals</Link></CardBody></Card> : null}
    {planning ? <NotificationCenter notifications={planning.notifications} preferences={planning.notificationPreferences} compact/> : null}
    {model.firstWeek ? <Card><CardHeader title={model.firstWeek.title}/><CardBody><p>{model.firstWeek.body}</p><div className="button-row">{model.firstWeek.primaryHref && model.firstWeek.primaryLabel ? <Link href={model.firstWeek.primaryHref} className="ui-button ui-button--primary">{model.firstWeek.primaryLabel}</Link> : null}{model.firstWeek.secondaryHref && model.firstWeek.secondaryLabel ? <Link href={model.firstWeek.secondaryHref} className="ui-button ui-button--secondary">{model.firstWeek.secondaryLabel}</Link> : null}{model.firstWeek.shareText ? <WeekSummaryShare text={model.firstWeek.shareText}/> : null}</div></CardBody></Card> : null}
    <div id="study-order"><TodayPlanClient model={model}/></div>
  </div>;
}
