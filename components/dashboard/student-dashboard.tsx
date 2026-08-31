import Link from "next/link";
import { DashboardQuickActions, DashboardViewTracker } from "./dashboard-interactions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import type { DashboardPageModel, DashboardReadyModel } from "@/lib/dashboard/types";

function formatDate(value: string | null) {
  if (!value) return "Date pending";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatVerifiedAt(value: string | null) {
  if (!value) return "Awaiting verification";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Officially verified";
  return `Verified ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(date)}`;
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function GuestDashboard() {
  return (
    <div className="student-dashboard student-dashboard--simple-state">
      <PageHeader
        preview={false}
        eyebrow="Dashboard"
        title="Your CA study workspace"
        description="Sign in to sync your course, progress, planner and study history across devices."
      />
      <Card className="dashboard-access-card">
        <CardBody>
          <span className="dashboard-access-card__icon"><Icon name="shield" size={22}/></span>
          <div><h2>Sign in to personalize your dashboard</h2><p>Your academic selection and saved study data will appear here.</p></div>
          <Link className="dashboard-primary-link" href="/login?next=%2Fdashboard">Sign in <Icon name="arrow" size={15}/></Link>
        </CardBody>
      </Card>
    </div>
  );
}

function OnboardingDashboard({ displayName }: { displayName: string }) {
  return (
    <div className="student-dashboard student-dashboard--simple-state">
      <PageHeader
        preview={false}
        eyebrow="Dashboard"
        title={`Finish your setup, ${displayName}.`}
        description="Choose your level, group, attempt and study target to personalize CA Progress."
      />
      <Card className="dashboard-access-card">
        <CardBody>
          <span className="dashboard-access-card__icon"><Icon name="target" size={22}/></span>
          <div><h2>Complete your academic setup</h2><p>It only takes a moment.</p></div>
          <Link className="dashboard-primary-link" href="/onboarding">Continue setup <Icon name="arrow" size={15}/></Link>
        </CardBody>
      </Card>
    </div>
  );
}

function AttemptStrip({ model }: { model: DashboardReadyModel }) {
  const pending = model.countdown.status === "awaiting_verified_date";
  const status = pending
    ? "Countdown coming soon"
    : model.countdown.status === "past"
      ? "Attempt completed"
      : `${model.countdown.daysRemaining ?? "—"} days to go`;
  const date = model.countdown.targetDate ? formatDate(model.countdown.targetDate) : null;

  return (
    <section className="dashboard-attempt-strip dashboard-attempt-card" aria-label="Current attempt">
      <div className="dashboard-attempt-card__main">
        <div className="dashboard-attempt-card__badges">
          <span className="dashboard-attempt-card__verified"><Icon name="shield" size={13}/> Verified attempt</span>
          <span>{model.context.levelName} · {model.context.groupLabel}</span>
        </div>
        <span className="dashboard-attempt-card__eyebrow">{model.context.attemptLabel}</span>
        <h2>{status}</h2>
        <p>
          {pending
            ? `Your ${model.context.attemptLabel} attempt is selected. The countdown will begin as soon as the official exam date is confirmed.`
            : date
              ? `${date} · Keep your study plan aligned with your selected attempt.`
              : "Keep your study plan aligned with your selected attempt."}
        </p>
        <div className="dashboard-attempt-card__meta">
          <span><Icon name="clock" size={13}/>{formatVerifiedAt(model.countdown.lastVerifiedAt)}</span>
          {model.countdown.sourceUrl ? <a href={model.countdown.sourceUrl} target="_blank" rel="noreferrer">Official source <Icon name="arrow" size={13}/></a> : null}
        </div>
      </div>

      <div className="dashboard-attempt-card__summary" aria-label="Academic selection">
        <div><strong>{model.context.subjectCount}</strong><span>Subjects</span></div>
        <div><strong>{model.context.chapterCount}</strong><span>Chapters</span></div>
        <div><strong>{model.context.groupLabel}</strong><span>Selection</span></div>
      </div>
    </section>
  );
}

function TodayOverview({ model }: { model: DashboardReadyModel }) {
  return (
    <Link href="/planner/today" className="dashboard-overview-card" aria-label="Open today plan">
      <header className="dashboard-overview-card__header">
        <span className="dashboard-overview-card__icon"><Icon name="sparkles" size={17}/></span>
        <div><strong>Today</strong><small>Your study plan</small></div>
        <Icon name="chevron" size={14}/>
      </header>
      <div className="dashboard-overview-card__primary">
        <strong>{model.today.tasks}</strong><span>tasks</span><small>{model.today.estimatedMinutes} min planned</small>
      </div>
      <div className="dashboard-overview-card__metrics">
        <span><b>{model.today.revisions}</b> revisions</span>
        <span><b>{model.today.tests}</b> tests</span>
      </div>
    </Link>
  );
}

function StudyOverview({ model }: { model: DashboardReadyModel }) {
  return (
    <Link href="/study" className="dashboard-overview-card" aria-label="Open study mode">
      <header className="dashboard-overview-card__header">
        <span className="dashboard-overview-card__icon"><Icon name="timer" size={17}/></span>
        <div><strong>Study</strong><small>Time & consistency</small></div>
        <Icon name="chevron" size={14}/>
      </header>
      <div className="dashboard-overview-card__primary">
        <strong>{formatMinutes(model.study.studiedThisWeekMinutes)}</strong><span>this week</span><small>{formatMinutes(model.study.dailyTargetMinutes)} daily target</small>
      </div>
      <div className="dashboard-overview-card__metrics dashboard-overview-card__metrics--three">
        <span><b>{formatMinutes(model.study.weeklyTargetMinutes)}</b> weekly</span>
        <span><b>{model.study.streakDays}</b> day{model.study.streakDays === 1 ? "" : "s"} streak</span>
      </div>
    </Link>
  );
}

function ProgressOverview({ model }: { model: DashboardReadyModel }) {
  return (
    <Link href="/progress" className="dashboard-overview-card dashboard-overview-card--progress" aria-label="Open progress tracker">
      <header className="dashboard-overview-card__header">
        <span className="dashboard-overview-card__icon"><Icon name="chart" size={17}/></span>
        <div><strong>Progress</strong><small>Your syllabus progress</small></div>
        <Icon name="chevron" size={14}/>
      </header>
      <div className="dashboard-overview-card__primary">
        <strong>{model.progress.overallPercent}%</strong><span>overall</span><small>{model.context.chapterCount} chapters tracked</small>
      </div>
      <div className="dashboard-overview-progress">
        {model.progress.groups.slice(0, 2).map((group) => (
          <div key={group.code}>
            <span>{group.name}</span>
            <i aria-hidden="true"><b style={{ width: `${group.percent}%` }}/></i>
            <small>{group.percent}%</small>
          </div>
        ))}
      </div>
    </Link>
  );
}

function ReadyDashboard({ model }: { model: DashboardReadyModel }) {
  const latestUpdate = model.icai.updates[0] ?? null;

  return (
    <div className="student-dashboard student-dashboard--home">
      <DashboardViewTracker/>
      <PageHeader
        preview={false}
        eyebrow="Dashboard"
        title={`Welcome back, ${model.viewer.displayName}.`}
        description={`${model.context.levelName} · ${model.context.groupLabel} · ${model.context.attemptLabel}`}
      />

      <AttemptStrip model={model}/>

      <section className="dashboard-overview-grid" aria-label="Study overview">
        <TodayOverview model={model}/>
        <StudyOverview model={model}/>
        <ProgressOverview model={model}/>
      </section>

      <section className="dashboard-home-grid">
        <Card className="dashboard-next-card">
          <CardHeader title="Next up" action={<Link className="ui-text-link" href={model.recommendation.href}>Open <Icon name="arrow" size={13}/></Link>}/>
          <CardBody>
            <div className="dashboard-next-card__row">
              <span className="dashboard-next-card__icon"><Icon name="target" size={18}/></span>
              <div><strong>{model.recommendation.title}</strong><p>{model.recommendation.description}</p></div>
            </div>
          </CardBody>
        </Card>

        <Card className="dashboard-actions-card">
          <CardHeader title="Quick actions"/>
          <CardBody><DashboardQuickActions actions={model.quickActions}/></CardBody>
        </Card>
      </section>

      <Card className="dashboard-icai-compact">
        <CardHeader title="ICAI updates" action={<Link className="ui-text-link" href="/updates">View all <Icon name="arrow" size={13}/></Link>}/>
        <CardBody>
          {latestUpdate ? (
            <article className="dashboard-latest-update">
              <span className="dashboard-latest-update__icon"><Icon name="book" size={17}/></span>
              <div><strong>{latestUpdate.title}</strong><p>{latestUpdate.summary || "Official update for your selected course and attempt."}</p></div>
              <a href={latestUpdate.officialUrl} target="_blank" rel="noreferrer">ICAI <Icon name="arrow" size={12}/></a>
            </article>
          ) : (
            <div className="dashboard-no-update">
              <span><Icon name="check" size={16}/></span>
              <div><strong>No new updates</strong><p>There are no current ICAI changes matching your selection.</p></div>
              <small>{formatVerifiedAt(model.icai.verifiedAt)}</small>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export function StudentDashboard({ model }: { model: DashboardPageModel }) {
  if (model.mode === "guest") return <GuestDashboard/>;
  if (model.mode === "onboarding") return <OnboardingDashboard displayName={model.viewer.displayName}/>;
  return <ReadyDashboard model={model}/>;
}
