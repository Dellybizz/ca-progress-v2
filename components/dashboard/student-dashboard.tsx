import Link from "next/link";
import { DashboardQuickActions, DashboardViewTracker } from "./dashboard-interactions";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import type { DashboardPageModel, DashboardReadyModel } from "@/lib/dashboard/types";

function formatDate(value: string | null) {
  if (!value) return "Not published yet";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatVerifiedAt(value: string | null) {
  if (!value) return "Awaiting first verified sync";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Verified by ICAI source";
  return `Verified ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(date)} IST`;
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function FutureMetric({ label, phase }: { label: string; phase: string }) {
  return <div className="dashboard-future-metric"><strong>—</strong><span>{label}</span><small>{phase}</small></div>;
}

function UnknownProgress({ label, chapters }: { label: string; chapters: number }) {
  return (
    <div className="dashboard-progress-row">
      <div><strong>{label}</strong><span>{chapters} {chapters === 1 ? "chapter" : "chapters"}</span></div>
      <div className="dashboard-progress-unknown" aria-label={`${label} progress not tracked yet`}><span /></div>
      <small>Not tracked yet</small>
    </div>
  );
}

function GuestDashboard() {
  return (
    <div className="student-dashboard">
      <PageHeader preview={false} eyebrow="Student home" title="Your study dashboard starts with your course selection." description="Sign in to connect your CA level, group and verified attempt. Guest mode stays local and does not create private dashboard records." />
      <Card className="dashboard-access-card">
        <CardBody>
          <span className="dashboard-access-card__icon"><Icon name="shield" size={24} /></span>
          <div><Badge tone="info">Guest mode</Badge><h2>Sign in for a personalized dashboard</h2><p>Your verified attempt, applicable subjects, official ICAI changes and study target are tied to your account profile.</p></div>
          <Link className="dashboard-primary-link" href="/login?next=%2Fdashboard">Continue to sign in <Icon name="arrow" size={16} /></Link>
        </CardBody>
      </Card>
    </div>
  );
}

function OnboardingDashboard({ displayName }: { displayName: string }) {
  return (
    <div className="student-dashboard">
      <PageHeader preview={false} eyebrow="Student home" title={`Finish your setup, ${displayName}.`} description="The dashboard needs your level, group and attempt before it can safely scope academic and ICAI information." />
      <Card className="dashboard-access-card">
        <CardBody>
          <span className="dashboard-access-card__icon"><Icon name="target" size={24} /></span>
          <div><Badge tone="warning">Setup incomplete</Badge><h2>Complete your academic profile</h2><p>This prevents Foundation, Intermediate or Final subjects and official updates from being mixed together.</p></div>
          <Link className="dashboard-primary-link" href="/onboarding?next=%2Fdashboard">Continue setup <Icon name="arrow" size={16} /></Link>
        </CardBody>
      </Card>
    </div>
  );
}

function CountdownHero({ model }: { model: DashboardReadyModel }) {
  const countLabel = model.countdown.status === "awaiting_verified_date"
    ? "Date pending"
    : model.countdown.status === "past"
      ? "Attempt completed"
      : `${model.countdown.daysRemaining ?? "—"} days`;

  return (
    <section className="smart-dashboard-hero" aria-labelledby="attempt-countdown-title">
      <div className="smart-dashboard-hero__content">
        <div className="smart-dashboard-hero__badges">
          <Badge tone="success"><Icon name="shield" size={13} /> Verified attempt</Badge>
          <span>{model.context.levelName} · {model.context.groupLabel}</span>
        </div>
        <p className="smart-dashboard-hero__eyebrow">{model.context.attemptLabel}</p>
        <h2 id="attempt-countdown-title">{countLabel}</h2>
        <p>{model.countdown.targetDate ? `${formatDate(model.countdown.targetDate)} · ${model.countdown.title}` : "A verified examination date has not been published into the Phase 8 dataset yet. The dashboard will update automatically when it is."}</p>
        <div className="smart-dashboard-hero__meta">
          <span><Icon name="clock" size={15} /> {formatVerifiedAt(model.countdown.lastVerifiedAt)}</span>
          {model.countdown.sourceUrl ? <a href={model.countdown.sourceUrl} target="_blank" rel="noreferrer">Official source <Icon name="arrow" size={14} /></a> : null}
        </div>
      </div>
      <div className="smart-dashboard-hero__summary" aria-label="Academic selection summary">
        <div><strong>{model.context.subjectCount}</strong><span>subjects</span></div>
        <div><strong>{model.context.chapterCount}</strong><span>chapters</span></div>
        <div><strong>{model.context.groupLabel}</strong><span>selection</span></div>
      </div>
    </section>
  );
}

function ReadyDashboard({ model }: { model: DashboardReadyModel }) {
  return (
    <div className="student-dashboard">
      <DashboardViewTracker />
      <PageHeader
        preview={false}
        eyebrow="Today"
        title={`Welcome back, ${model.viewer.displayName}.`}
        description={`${model.context.levelName} · ${model.context.groupLabel} · ${model.context.attemptLabel}. Your home is assembled server-side from your profile and verified reference data.`}
        actions={<Link className="dashboard-header-link" href="/settings/profile">Edit academic profile</Link>}
      />

      <CountdownHero model={model} />

      <section className="smart-dashboard-grid smart-dashboard-grid--top">
        <Card className="dashboard-today-card">
          <CardHeader title="Today" description="Tasks, revisions and tests in one place as their source phases come online." action={<Badge tone="neutral">Source-ready</Badge>} />
          <CardBody>
            <div className="dashboard-today-metrics">
              <FutureMetric label="Tasks" phase="Planner · Phase 6" />
              <FutureMetric label="Revisions" phase="Smart planner · Phase 9" />
              <FutureMetric label="Tests" phase="Progress · Phase 5" />
            </div>
            <div className="dashboard-readiness-note"><Icon name="sparkles" size={17} /><p>No fake daily totals are shown before the normalized source rows exist. These slots are already wired for the later phases.</p></div>
          </CardBody>
        </Card>

        <Card className="dashboard-study-card">
          <CardHeader title="Study target" description="Your real onboarding target, ready for Phase 6 session totals." action={<Badge tone="brand">Profile target</Badge>} />
          <CardBody>
            <div className="dashboard-study-target"><div><strong>{formatMinutes(model.study.dailyTargetMinutes)}</strong><span>daily target</span></div><div><strong>{formatMinutes(model.study.weeklyTargetMinutes)}</strong><span>weekly target</span></div></div>
            <div className="dashboard-study-secondary"><span><Icon name="clock" size={16} /> Studied this week <strong>Not tracked yet</strong></span><span><Icon name="sparkles" size={16} /> Streak <strong>Not tracked yet</strong></span></div>
          </CardBody>
        </Card>
      </section>

      <section className="smart-dashboard-grid smart-dashboard-grid--main">
        <Card className="dashboard-progress-card">
          <CardHeader title="Progress" description="Applicable syllabus structure is live; completion percentages arrive from normalized Phase 5 rows." action={<Link className="ui-text-link" href="/progress">Open progress <Icon name="arrow" size={14} /></Link>} />
          <CardBody>
            <div className="dashboard-overall-progress"><div><strong>Overall progress</strong><span>{model.context.chapterCount} applicable chapters</span></div><Badge tone="neutral">Not tracked yet</Badge></div>
            <div className="dashboard-progress-groups">
              {model.progress.groups.map((group) => <UnknownProgress key={group.code} label={group.name} chapters={group.chapterCount} />)}
            </div>
            <div className="dashboard-subject-grid">
              {model.progress.subjects.slice(0, 6).map((subject) => (
                <Link key={subject.id} href={`/subjects/${subject.slug}?attempt=${encodeURIComponent(model.context.attemptKey)}`} className="dashboard-subject-card">
                  <span>{subject.groupName}</span><strong>{subject.title}</strong><small>{subject.chapterCount} chapters · Progress pending</small>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>

        <div className="dashboard-side-stack">
          <Card className="dashboard-recommendation-card">
            <CardHeader title="What to study next" description="One explainable recommendation slot, ready for Phase 9 ranking." action={<Badge tone="info">Phase 9 ready</Badge>} />
            <CardBody>
              <span className="dashboard-recommendation-card__icon"><Icon name="target" size={22} /></span>
              <h3>{model.recommendation.title}</h3>
              <p>{model.recommendation.description}</p>
              <Link className="dashboard-primary-link" href={model.recommendation.href}>Open recommendation <Icon name="arrow" size={15} /></Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Quick actions" description="Jump directly into your most common study workflows." />
            <CardBody><DashboardQuickActions actions={model.quickActions} /></CardBody>
          </Card>
        </div>
      </section>

      <section className="smart-dashboard-grid smart-dashboard-grid--updates">
        <Card className="dashboard-icai-card">
          <CardHeader title="Latest ICAI changes" description="Scoped to your level, verified attempt and applicable subjects. Refreshes from live Phase 8 data without a code deploy." action={<Link className="ui-text-link" href="/updates">All updates <Icon name="arrow" size={14} /></Link>} />
          <CardBody>
            {model.icai.updates.length ? <div className="dashboard-update-list">{model.icai.updates.map((update) => (
              <article className="dashboard-update-item" key={update.id}>
                <div><Badge tone="success">Official</Badge><Badge tone="neutral">{update.type.replaceAll("_", " ")}</Badge></div>
                <h3>{update.title}</h3>
                {update.summary ? <p>{update.summary}</p> : null}
                <footer><span>{update.publishedOn ? formatDate(update.publishedOn) : formatVerifiedAt(update.lastVerifiedAt)}</span><a href={update.officialUrl} target="_blank" rel="noreferrer">Open on ICAI <Icon name="arrow" size={13} /></a></footer>
              </article>
            ))}</div> : <EmptyState compact icon="book" title="No matching ICAI updates yet" description="The verified Phase 8 feed currently has no active item matching your level, attempt and subjects. New verified items will appear here without a deployment." />}
            <p className="dashboard-verification-footer"><Icon name="shield" size={14} /> {formatVerifiedAt(model.icai.verifiedAt)}</p>
          </CardBody>
        </Card>

        <Card className="dashboard-alert-card">
          <CardHeader title="Alerts & consistency" description="No synthetic alerts: each slot names the source it is waiting for." />
          <CardBody><div className="dashboard-alert-list">{model.alerts.map((alert) => (
            <div key={alert.kind} className="dashboard-alert-item"><span><Icon name={alert.kind === "test" ? "tests" : alert.kind === "streak" ? "sparkles" : "layers"} size={17} /></span><div><strong>{alert.title}</strong><p>{alert.description}</p></div><Badge tone="neutral">Phase {alert.phase}</Badge></div>
          ))}</div></CardBody>
        </Card>
      </section>
    </div>
  );
}

export function StudentDashboard({ model }: { model: DashboardPageModel }) {
  if (model.mode === "guest") return <GuestDashboard />;
  if (model.mode === "onboarding") return <OnboardingDashboard displayName={model.viewer.displayName} />;
  return <ReadyDashboard model={model} />;
}
