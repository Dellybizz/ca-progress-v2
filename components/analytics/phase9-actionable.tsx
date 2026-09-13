import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Phase9ReadyModel } from "@/lib/analytics/phase9";

function hoursMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function forecastStatus(status: Phase9ReadyModel["forecast"]["status"]) {
  return ({
    insufficient_data: "Need more evidence",
    ahead: "Ahead of baseline target",
    at_risk: "Revision buffer at risk",
    behind: "Behind baseline pace",
    complete: "First coverage complete",
  } as const)[status];
}

export function Phase9ActionableAnalytics({ model }: { model: Phase9ReadyModel }) {
  const weekly = model.weeklyStudy;
  return <div className="phase9-actionable-analytics">
    <Card>
      <CardHeader title="What changed this week?" description="Rolling study time from completed sessions only." action={<Badge tone="brand">Real activity</Badge>}/>
      <CardBody>
        <div className="analytics-consistency">
          <div><strong>{hoursMinutes(weekly.currentMinutes)}</strong><span>last 7 days</span></div>
          <div><strong>{hoursMinutes(weekly.priorMinutes)}</strong><span>previous 7 days</span></div>
          <div><strong>{weekly.changeMinutes > 0 ? "+" : ""}{hoursMinutes(Math.abs(weekly.changeMinutes))}</strong><span>{weekly.direction === "up" ? "more" : weekly.direction === "down" ? "less" : weekly.direction === "new" ? "new activity" : "no change"}</span></div>
        </div>
        <p><small><strong>Calculation:</strong> {weekly.calculation}</small></p>
      </CardBody>
    </Card>

    <section className="analytics-hero-grid" aria-label="Readiness definitions">
      {model.readiness.map((metric) => <Card key={metric.key}><CardBody>
        <span>{metric.label}</span><strong>{metric.percent}%</strong>
        <div className="analytics-meter" aria-label={`${metric.percent}%`}><span style={{ width: `${metric.percent}%` }}/></div>
        <small>{metric.numerator}/{metric.denominator} chapters</small>
        <p><strong>{metric.question}</strong></p>
        <p><small>{metric.calculation}</small></p>
      </CardBody></Card>)}
    </section>

    <section className="analytics-grid">
      <Card><CardHeader title="Where is understanding weakest?" description="Self-rating is treated as a signal, never as mastery."/><CardBody>
        {model.lowestUnderstanding ? <div className="analytics-list"><div><span><strong>{model.lowestUnderstanding.score}/100</strong><small>{model.lowestUnderstanding.subjectTitle ?? "General study"}{model.lowestUnderstanding.chapterTitle ? ` · ${model.lowestUnderstanding.chapterTitle}` : ""}</small></span></div><p>{model.lowestUnderstanding.action}</p><p><small>{model.lowestUnderstanding.calculation}</small></p></div> : <EmptyState compact title="Not enough reflection evidence" description="Save understanding ratings after study sessions before CA Progress identifies a lowest self-rated area."/>}
      </CardBody></Card>

      <Card><CardHeader title="Which revision is most overdue?" description="Only pending revision records are considered."/><CardBody>
        {model.mostOverdueRevision ? <div><strong>{model.mostOverdueRevision.chapterTitle}</strong><p>Revision {model.mostOverdueRevision.revisionNumber} · {model.mostOverdueRevision.overdueDays} days overdue</p><p>{model.mostOverdueRevision.action}</p><p><small>{model.mostOverdueRevision.calculation}</small></p></div> : <EmptyState compact title="No overdue revision" description="There is no applicable pending revision whose effective due date has passed."/>}
      </CardBody></Card>
    </section>

    <section className="analytics-grid">
      <Card><CardHeader title="How consistent am I by subject?" description="Active study days in the last 14 days, not XP or streak points."/><CardBody>
        {model.consistency.length ? <div className="analytics-list">{model.consistency.map((subject) => <div key={subject.subjectId}><span><strong>{subject.subjectTitle}</strong><small>{subject.minutesLast14} minutes recorded</small></span><b>{subject.activeDaysLast14}/14 days</b></div>)}</div> : <EmptyState compact title="No subject study sessions yet" description="Finish subject-linked Study sessions to build consistency evidence."/>}
        {model.consistency[0] ? <p><small><strong>Calculation:</strong> {model.consistency[0].calculation}</small></p> : null}
      </CardBody></Card>

      <Card><CardHeader title="What do my tests say?" description="Append-only Test Archive attempts only."/><CardBody>
        {model.recentTest ? <div className="analytics-list"><div><span><strong>Most recent</strong><small>{model.recentTest.subjectTitle} · {model.recentTest.chapterTitle} · Attempt {model.recentTest.attemptNumber}</small></span><b>{model.recentTest.percentage}%</b></div>{model.highestTest ? <div><span><strong>Highest recorded</strong><small>{model.highestTest.subjectTitle} · {model.highestTest.chapterTitle} · Attempt {model.highestTest.attemptNumber}</small></span><b>{model.highestTest.percentage}%</b></div> : null}</div> : <EmptyState compact title="No test-attempt evidence yet" description="Save a Test 1 or Test 2 attempt before CA Progress summarizes test performance."/>}
        <p><small>Percentages come from immutable test_attempts rows; retakes remain separate attempts.</small></p>
      </CardBody></Card>
    </section>

    <Card>
      <CardHeader title="Am I on pace for my attempt?" description="Evidence-gated baseline forecast from your chapter completions and verified attempt date only." action={<Badge tone={model.forecast.eligible ? "brand" : "neutral"}>Baseline · not Mentor</Badge>}/>
      <CardBody>
        <div className="analytics-consistency"><div><strong>{forecastStatus(model.forecast.status)}</strong><span>baseline status</span></div><div><strong>{model.forecast.observedChaptersPerWeek ?? "—"}</strong><span>observed chapters/week</span></div><div><strong>{model.forecast.requiredChaptersPerWeek ?? "—"}</strong><span>required chapters/week</span></div></div>
        {model.forecast.eligible ? <div className="analytics-list"><div><span><strong>Projected first-coverage finish</strong><small>Deterministic projection</small></span><b>{model.forecast.projectedCompletionDate ?? "Complete"}</b></div><div><span><strong>Recommended target</strong><small>30-day revision buffer before verified attempt</small></span><b>{model.forecast.recommendedTargetDate ?? "—"}</b></div><div><span><strong>Verified attempt date</strong><small>{model.forecast.attemptLabel}</small></span><b>{model.forecast.verifiedAttemptDate ?? "—"}</b></div></div> : <div><p><strong>CA Progress is withholding a personalised completion date.</strong></p><ul>{model.forecast.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>{model.forecast.requiredChaptersPerWeek !== null ? <p>A deterministic required pace can still be shown from your remaining applicable chapters and verified attempt date: <strong>{model.forecast.requiredChaptersPerWeek} chapters/week</strong>.</p> : null}</div>}
        <p><small><strong>Calculation:</strong> {model.forecast.calculation}</small></p>
        <p><small><strong>Boundary:</strong> {model.forecast.boundary}</small></p>
        <Link href="/analytics/forecast" className="ui-text-link">Open forecast details</Link>
      </CardBody>
    </Card>
  </div>;
}
