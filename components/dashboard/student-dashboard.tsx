import Link from "next/link";
import { DashboardLeaderboard, DashboardQuickActions, DashboardViewTracker } from "./dashboard-interactions";
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

function dashboardDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function dashboardGreeting(value: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date(value)));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function GuestDashboard() {
  return (
    <div className="student-dashboard student-dashboard--home">
      <PageHeader
        preview={false}
        eyebrow="Dashboard"
        title="Explore your CA study workspace."
        description="Browse the study tools now. Sign in to personalize your dashboard and save your own course, plan and progress."
      />

      <section className="dashboard-overview-grid" aria-label="Study overview">
        <Link href="/syllabus" className="dashboard-overview-card" aria-label="Browse subjects">
          <header className="dashboard-overview-card__header">
            <span className="dashboard-overview-card__icon"><Icon name="book" size={17}/></span>
            <div><strong>Subjects</strong><small>Explore the syllabus</small></div>
            <Icon name="chevron" size={14}/>
          </header>
          <div className="dashboard-overview-card__primary">
            <strong>Browse</strong><span>the course</span><small>Choose a subject to begin</small>
          </div>
          <div className="dashboard-overview-card__metrics">
            <span><b>Public</b> syllabus</span>
            <span><b>Free</b> to explore</span>
          </div>
        </Link>

        <Link href="/study" className="dashboard-overview-card" aria-label="Open study mode">
          <header className="dashboard-overview-card__header">
            <span className="dashboard-overview-card__icon"><Icon name="timer" size={17}/></span>
            <div><strong>Study</strong><small>Try focus mode</small></div>
            <Icon name="chevron" size={14}/>
          </header>
          <div className="dashboard-overview-card__primary">
            <strong>Start</strong><span>a session</span><small>Sign in to save study time</small>
          </div>
          <div className="dashboard-overview-card__metrics dashboard-overview-card__metrics--three">
            <span><b>Focus</b> mode</span>
            <span><b>Save</b> your history</span>
          </div>
        </Link>

        <Link href="/progress" className="dashboard-overview-card dashboard-overview-card--progress" aria-label="Explore progress tracking">
          <header className="dashboard-overview-card__header">
            <span className="dashboard-overview-card__icon"><Icon name="chart" size={17}/></span>
            <div><strong>Progress</strong><small>See how tracking works</small></div>
            <Icon name="chevron" size={14}/>
          </header>
          <div className="dashboard-overview-card__primary">
            <strong>Track</strong><span>your syllabus</span><small>Sign in to keep your progress</small>
          </div>
          <div className="dashboard-overview-progress">
            <div><span>Course progress</span><i aria-hidden="true"><b style={{ width: "0%" }}/></i><small>—</small></div>
          </div>
        </Link>
      </section>

      <section className="dashboard-home-grid">
        <Card className="dashboard-next-card">
          <CardHeader title="Get started" />
          <CardBody>
            <div className="dashboard-next-card__row">
              <span className="dashboard-next-card__icon"><Icon name="sparkles" size={18}/></span>
              <div><strong>Choose a subject to explore</strong><p>Review the public syllabus first, then sign in when you want a personal study plan.</p></div>
            </div>
          </CardBody>
        </Card>

        <Card className="dashboard-actions-card">
          <CardHeader title="Quick actions"/>
          <CardBody>
            <div className="dashboard-quick-actions">
              <Link href="/syllabus" className="dashboard-quick-action"><span><Icon name="book" size={16}/></span><strong>Browse Subjects</strong><small>Explore the syllabus</small></Link>
              <Link href="/updates" className="dashboard-quick-action"><span><Icon name="bell" size={16}/></span><strong>ICAI Updates</strong><small>View official updates</small></Link>
              <Link href="/login?next=%2Fdashboard" className="dashboard-quick-action"><span><Icon name="arrow" size={16}/></span><strong>Sign In</strong><small>Save your workspace</small></Link>
            </div>
          </CardBody>
        </Card>
      </section>

      <Card className="dashboard-icai-compact">
        <CardHeader title="ICAI updates" action={<Link className="ui-text-link" href="/updates">View all <Icon name="arrow" size={13}/></Link>}/>
        <CardBody>
          <div className="dashboard-no-update">
            <span><Icon name="book" size={16}/></span>
            <div><strong>Official updates are available</strong><p>Open the updates page to see the latest verified ICAI notices.</p></div>
          </div>
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

export function TodayOverview({ model }: { model: DashboardReadyModel }) {
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

export function StudyOverview({ model }: { model: DashboardReadyModel }) {
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

export function ProgressOverview({ model }: { model: DashboardReadyModel }) {
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
  const continueSubject = model.progress.subjects.find((subject) => subject.percent < 100) ?? model.progress.subjects[0] ?? null;
  const intendedActions = model.quickActions.map((action) => action.key === "open_progress"
    ? { ...action, label: "Record progress", description: "Update your syllabus" }
    : action.key === "start_study"
      ? { ...action, label: "Save test", description: "Record an attempt", href: "/tests" }
      : action.key === "add_note"
        ? { ...action, label: "New note", description: "Capture revision notes" }
        : { ...action, label: "Add task", description: "Plan your study" });

  return (
    <div className="student-dashboard student-dashboard--home">
      <DashboardViewTracker/>
      <header className="dashboard-welcome" aria-label="Welcome back dashboard">
        <div><time dateTime={model.generatedAt}>{dashboardDate(model.generatedAt)}</time><h1>{dashboardGreeting(model.generatedAt)}, {model.viewer.displayName}</h1><p>{model.context.levelName} · {model.context.groupLabel} · {model.context.attemptLabel}</p></div>
      </header>

      <div className="dashboard-command-layout">
        <main className="dashboard-command-main">
          <section className="dashboard-focus-card" aria-labelledby="dashboard-focus-title">
            <div className="dashboard-focus-card__content"><span className="dashboard-focus-card__eyebrow"><Icon name="target" size={15}/> Today&apos;s focus</span><h2 id="dashboard-focus-title">{model.recommendation.title}</h2><p>{model.today.estimatedMinutes ? `${formatMinutes(model.today.estimatedMinutes)} planned · ${model.today.tasks} task${model.today.tasks === 1 ? "" : "s"} remaining` : model.recommendation.description}</p><div className="dashboard-focus-card__actions"><Link className="dashboard-focus-card__primary" href="/study">Start studying <Icon name="arrow" size={14}/></Link><Link className="dashboard-focus-card__secondary" href="/planner/today">View today&apos;s plan</Link></div></div>
            <div className="dashboard-focus-scene" aria-hidden="true"><span className="dashboard-focus-book dashboard-focus-book--top">CA Study</span><span className="dashboard-focus-book dashboard-focus-book--bottom"/><span className="dashboard-focus-cup">Small<br/>Steps</span></div>
          </section>

          <section className="dashboard-metric-strip dashboard-metric-strip--intended" aria-label="Study overview">
            <Link href="/study" className="dashboard-metric-card"><span><Icon name="timer" size={21}/></span><div><strong>{formatMinutes(model.study.studiedThisWeekMinutes)}</strong><small>This week</small></div></Link>
            <Link href="/activity" className="dashboard-metric-card"><span><Icon name="sparkles" size={21}/></span><div><strong>{model.study.streakDays} day{model.study.streakDays === 1 ? "" : "s"}</strong><small>streak</small></div></Link>
            <Link href="/progress" className="dashboard-metric-card"><span><Icon name="book" size={21}/></span><div><strong>{model.progress.overallPercent}%</strong><small>Syllabus completed</small></div></Link>
          </section>

          <Card className="dashboard-continue-card"><CardHeader title="Continue where you left off"/><CardBody>{continueSubject ? <div className="dashboard-continue-row" aria-label="Next up"><span><Icon name="notes" size={18}/></span><div><strong>{continueSubject.title}</strong><small>{continueSubject.groupName}</small></div><i><b style={{ width: `${continueSubject.percent}%` }}/></i><em>{continueSubject.percent}%</em><Link href={`/subjects/${continueSubject.slug}/progress`}>Continue</Link></div> : <div className="dashboard-panel-empty">Choose a subject to continue studying.</div>}</CardBody></Card>

          <Card className="dashboard-actions-card dashboard-actions-card--horizontal"><CardHeader title="Quick actions"/><CardBody><DashboardQuickActions actions={intendedActions}/></CardBody></Card>
        </main>

        <aside className="dashboard-command-rail" aria-label="Attempt and community overview">
          <AttemptStrip model={model}/>
          <Card className="dashboard-leaderboard-card">
            <CardHeader title="Monthly leaderboard" action={<Link className="ui-text-link" href="/activity#leaderboard">Leaderboard <Icon name="arrow" size={13}/></Link>}/>
            <CardBody><DashboardLeaderboard/></CardBody>
          </Card>
          <Card className="dashboard-icai-compact">
            <CardHeader title="Latest ICAI update" action={<Link className="ui-text-link" href="/updates">View all <Icon name="arrow" size={13}/></Link>}/>
            <CardBody>{latestUpdate ? <article className="dashboard-latest-update"><span className="dashboard-latest-update__icon"><Icon name="bell" size={17}/></span><div><strong>{latestUpdate.title}</strong><p>{latestUpdate.summary || "Official update for your selected course and attempt."}</p></div><a href={latestUpdate.officialUrl} target="_blank" rel="noreferrer" aria-label={`Open ${latestUpdate.title} on ICAI`}><Icon name="arrow" size={12}/></a></article> : <div className="dashboard-no-update"><span><Icon name="check" size={16}/></span><div><strong>No new updates</strong><p>There are no current ICAI changes matching your selection.</p></div></div>}</CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export function StudentDashboard({ model }: { model: DashboardPageModel }) {
  if (model.mode === "guest") return <GuestDashboard/>;
  if (model.mode === "onboarding") return <OnboardingDashboard displayName={model.viewer.displayName}/>;
  return <ReadyDashboard model={model}/>;
}
