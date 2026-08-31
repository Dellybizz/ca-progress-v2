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
    ? "Exam date pending"
    : model.countdown.status === "past"
      ? "Attempt completed"
      : `${model.countdown.daysRemaining ?? "—"} days to go`;
  const date = model.countdown.targetDate ? formatDate(model.countdown.targetDate) : null;

  return (
    <section className="dashboard-attempt-strip" aria-label="Current attempt">
      <div className="dashboard-attempt-strip__primary">
        <span className="dashboard-attempt-strip__label">Attempt</span>
        <div><strong>{model.context.attemptLabel}</strong><small>{date ? `${status} · ${date}` : status}</small></div>
      </div>
      <div className="dashboard-attempt-strip__facts" aria-label="Academic selection">
        <span>{model.context.levelName}</span>
        <span>{model.context.groupLabel}</span>
        <span>{model.context.subjectCount} subjects</span>
        <span>{model.context.chapterCount} chapters</span>
      </div>
      <div className="dashboard-attempt-strip__source">
        <small>{formatVerifiedAt(model.countdown.lastVerifiedAt)}</small>
        {model.countdown.sourceUrl ? <a href={model.countdown.sourceUrl} target="_blank" rel="noreferrer">Official source <Icon name="arrow" size={12}/></a> : null}
      </div>
    </section>
  );
}

function ReadyDashboard({ model }: { model: DashboardReadyModel }) {
  const latestUpdate = model.icai.updates[0] ?? null;
  const groupProgress = model.progress.groups.map((group) => `${group.name} ${group.percent}%`).join(" · ");

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

      <section className="dashboard-home-stats" aria-label="Study overview">
        <Link href="/planner/today" className="dashboard-home-stat">
          <span>Today</span><strong>{model.today.tasks}</strong><small>{model.today.estimatedMinutes} min planned</small>
        </Link>
        <Link href="/study" className="dashboard-home-stat">
          <span>Study</span><strong>{formatMinutes(model.study.studiedThisWeekMinutes)}</strong><small>{formatMinutes(model.study.dailyTargetMinutes)} daily target</small>
        </Link>
        <Link href="/progress" className="dashboard-home-stat">
          <span>Progress</span><strong>{model.progress.overallPercent}%</strong><small>{groupProgress || `${model.context.chapterCount} chapters`}</small>
        </Link>
        <Link href="/study" className="dashboard-home-stat">
          <span>Streak</span><strong>{model.study.streakDays}</strong><small>{model.study.streakDays === 1 ? "day" : "days"}</small>
        </Link>
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
