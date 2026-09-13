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
  const estimated = model.countdown.sourceKind === "admin_estimate";
  const status = pending
    ? "Countdown coming soon"
    : model.countdown.status === "exam_period"
      ? "Exam period"
      : model.countdown.status === "completed"
        ? "Exam completed"
        : `${model.countdown.daysRemaining ?? "—"} days to go`;
  const date = model.countdown.targetDate ? formatDate(model.countdown.targetDate) : null;
  const endDate = model.countdown.endDate ? formatDate(model.countdown.endDate) : date;
  const dateRange = date && endDate && date !== endDate ? `${date} – ${endDate}` : date;

  return (
    <section className="dashboard-a1-exam" aria-label="Current attempt" data-state={model.countdown.status}>
      <header><span><Icon name={estimated ? "clock" : "shield"} size={14}/>{pending ? "Date pending" : estimated ? "Planning estimate" : "ICAI verified"}</span><small>{model.context.attemptLabel}</small></header>
      <div className="dashboard-a1-exam__status"><strong>{status}</strong>{dateRange ? <time>{dateRange}</time> : null}</div>
      <p>{pending ? "We’ll start the countdown when ICAI confirms the exam period." : estimated ? "Set by CA Progress admin · replaced automatically when ICAI publishes a verified date." : formatVerifiedAt(model.countdown.lastVerifiedAt)}</p>
      {model.countdown.conflictWarning ? <p className="dashboard-a1-exam__warning" role="alert">{model.countdown.conflictWarning}</p> : null}
      <footer>{model.countdown.sourceUrl ? <a href={model.countdown.sourceUrl} target="_blank" rel="noreferrer">Official source</a> : <span>{model.context.levelName} · {model.context.groupLabel}</span>}<Link href="/dashboard/exam">View exam details <Icon name="arrow" size={13}/></Link></footer>
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
    <div className="student-dashboard dashboard-a1">
      <DashboardViewTracker/>
      <header className="dashboard-a1-header" aria-label="Welcome back dashboard">
        <div><time dateTime={model.generatedAt}>{dashboardDate(model.generatedAt)}</time><h1>{dashboardGreeting(model.generatedAt)}, {model.viewer.displayName}</h1></div>
        <p>{model.context.levelName}<span aria-hidden="true">/</span>{model.context.groupLabel}<span aria-hidden="true">/</span>{model.context.attemptLabel}</p>
      </header>

      <div className="dashboard-a1-grid">
        <section className="dashboard-a1-focus" aria-labelledby="dashboard-focus-title">
          <div className="dashboard-a1-focus__index" aria-hidden="true"><span>01</span><strong>CA</strong></div>
          <div className="dashboard-a1-focus__content"><span className="dashboard-a1-kicker"><Icon name="target" size={14}/>Today&apos;s focus</span><h2 id="dashboard-focus-title">{model.recommendation.title}</h2><p>{model.recommendation.description}</p><div className="dashboard-a1-focus__meta"><span>{model.today.tasks} task{model.today.tasks === 1 ? "" : "s"} remaining</span><span>{formatMinutes(model.today.estimatedMinutes)} planned</span></div><div className="dashboard-a1-focus__actions"><Link className="dashboard-a1-primary" href={model.recommendation.href}>Continue <Icon name="arrow" size={14}/></Link><Link href="/planner/today">Open today&apos;s plan</Link></div></div>
        </section>

        <AttemptStrip model={model}/>

        <nav className="dashboard-a1-pulse" aria-label="Study overview">
          <Link href="/study"><small>Studied this week</small><strong>{formatMinutes(model.study.studiedThisWeekMinutes)}</strong><span>{formatMinutes(model.study.dailyTargetMinutes)} daily target</span></Link>
          <Link href="/progress"><small>Syllabus completed</small><strong>{model.progress.overallPercent}%</strong><span>{model.context.chapterCount} chapters tracked</span></Link>
          <Link href="/activity"><small>Current streak</small><strong>{model.study.streakDays} day{model.study.streakDays === 1 ? "" : "s"}</strong><span>{model.study.sessionCountLast7Days} sessions this week</span></Link>
        </nav>

        <section className="dashboard-a1-continue" aria-labelledby="dashboard-continue-title">
          <header><div><span className="dashboard-a1-kicker">Continue learning</span><h2 id="dashboard-continue-title">Your active subject</h2></div><Link href="/syllabus">All subjects <Icon name="arrow" size={13}/></Link></header>
          {continueSubject ? <div className="dashboard-a1-continue__row" aria-label="Next up"><span className="dashboard-a1-subject-mark"><Icon name="book" size={18}/></span><div><strong>{continueSubject.title}</strong><small>{continueSubject.groupName} · {continueSubject.chapterCount} chapters</small></div><div className="dashboard-a1-progress"><i><b style={{ width: `${continueSubject.percent}%` }}/></i><span>{continueSubject.percent}%</span></div><Link href={`/subjects/${continueSubject.slug}/progress`}>Continue</Link></div> : <div className="dashboard-a1-empty">Choose a subject to start building your academic workspace.</div>}
        </section>

        <section className="dashboard-a1-leaderboard" aria-labelledby="dashboard-leaderboard-title"><header><div><span className="dashboard-a1-kicker">Community pulse</span><h2 id="dashboard-leaderboard-title">Monthly leaders</h2></div><Link href="/activity#leaderboard">Leaderboard</Link></header><DashboardLeaderboard/></section>

        <section className="dashboard-a1-update" aria-labelledby="dashboard-update-title"><header><div><span className="dashboard-a1-kicker">Official source</span><h2 id="dashboard-update-title">Latest ICAI update</h2></div><Link href="/updates">View all</Link></header>{latestUpdate ? <article><span><Icon name="bell" size={16}/></span><div><strong>{latestUpdate.title}</strong><p>{latestUpdate.summary || "Official update for your selected course and attempt."}</p></div><a href={latestUpdate.officialUrl} target="_blank" rel="noreferrer" aria-label={`Open ${latestUpdate.title} on ICAI`}><Icon name="arrow" size={13}/></a></article> : <div className="dashboard-a1-empty"><Icon name="check" size={16}/>No new updates match your current selection.</div>}</section>

        <section className="dashboard-a1-actions" aria-labelledby="dashboard-actions-title"><header><span className="dashboard-a1-kicker">Shortcuts</span><h2 id="dashboard-actions-title">Quick actions</h2></header><DashboardQuickActions actions={intendedActions}/></section>
      </div>
    </div>
  );
}

export function StudentDashboard({ model }: { model: DashboardPageModel }) {
  if (model.mode === "guest") return <GuestDashboard/>;
  if (model.mode === "onboarding") return <OnboardingDashboard displayName={model.viewer.displayName}/>;
  return <ReadyDashboard model={model}/>;
}
