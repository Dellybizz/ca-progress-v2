import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { FeatureLock } from "@/components/billing/feature-lock";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getPhase9AnalyticsModel } from "@/lib/analytics/phase9";
import { optionalUser } from "@/lib/auth/server";
import { getEntitlementForUser } from "@/lib/billing/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Completion Forecast | CA Progress" };

function statusLabel(status: string) {
  return ({
    insufficient_data: "Need more evidence",
    ahead: "Ahead of baseline target",
    at_risk: "Revision buffer at risk",
    behind: "Behind baseline pace",
    complete: "First coverage complete",
  } as Record<string, string>)[status] ?? status;
}

export default async function ForecastPage() {
  const identity = await optionalUser();
  if (identity) {
    const access = await getEntitlementForUser(identity.id, "analytics.forecast");
    if (!access.allowed) return <div className="phase9-page"><PageHeader preview={false} eyebrow="Forecast" title="Completion forecast is not included in your current plan." description="Your progress data remains intact and available in Analytics and Progress."/><FeatureLock planName={access.planName} title="Unlock completion forecasting" description={access.upgradeMessage || "Compare plans to enable pace and completion forecasting."}/></div>;
  }

  const model = await getPhase9AnalyticsModel();
  if (model.mode === "guest") return <div className="phase9-page"><LoginRequired next="/analytics/forecast" title="Sign in to view your completion forecast"/></div>;
  if (model.mode === "setup") return <div className="phase9-page"><PageHeader preview={false} eyebrow="Forecast" title="Complete your academic profile first." description="Forecasting requires your applicable syllabus and selected attempt."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;

  const forecast = model.forecast;
  return <div className="phase9-page">
    <PageHeader
      preview={false}
      eyebrow="Forecast"
      title="Evidence-gated baseline completion forecast"
      description="A deterministic planning estimate from your own chapter-completion history and a verified exam date. It is not CA Thinker/Mentor intelligence and it is not an exam-result prediction."
      actions={<div className="phase9-header-links"><Link href="/analytics">Analytics</Link><Link href="/planner/today">Today Plan</Link></div>}
    />

    <Card>
      <CardHeader title={forecast.attemptLabel} description="Only a verified attempt date can anchor the baseline forecast." action={<Badge tone={forecast.eligible ? "brand" : "neutral"}>Baseline · not Mentor</Badge>}/>
      <CardBody>
        <div className="phase9-forecast-hero">
          <div><span>Status</span><strong>{statusLabel(forecast.status)}</strong><p>{forecast.boundary}</p></div>
          <div className="phase9-forecast-percent"><strong>{forecast.completionPercent}%</strong><span>First Coverage</span></div>
        </div>
        <div className="phase9-progress-track phase9-progress-track--large"><span style={{ width: `${Math.min(100, Math.max(0, forecast.completionPercent))}%` }}/></div>

        <div className="phase9-forecast-stat-grid">
          <div><span>Completed chapters</span><strong>{forecast.completedChapters}/{forecast.totalChapters}</strong></div>
          <div><span>Remaining</span><strong>{forecast.remainingChapters}</strong></div>
          <div><span>Observed pace</span><strong>{forecast.observedChaptersPerWeek ?? "—"}{forecast.observedChaptersPerWeek !== null ? "/week" : ""}</strong></div>
          <div><span>Required pace</span><strong>{forecast.requiredChaptersPerWeek ?? "—"}{forecast.requiredChaptersPerWeek !== null ? "/week" : ""}</strong></div>
          <div><span>Projected finish</span><strong>{forecast.projectedCompletionDate ?? "Withheld"}</strong></div>
          <div><span>Recommended target</span><strong>{forecast.recommendedTargetDate ?? "Unavailable"}</strong></div>
          <div><span>Verified attempt</span><strong>{forecast.verifiedAttemptDate ?? "Unavailable"}</strong></div>
          <div><span>Evidence window</span><strong>{forecast.recentCompletionCount} completions · {forecast.observationDays} days</strong></div>
        </div>

        {!forecast.eligible ? <div className="phase9-estimate-banner"><strong>No personalised completion date is shown yet.</strong><ul>{forecast.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
        <p><small><strong>Calculation:</strong> {forecast.calculation}</small></p>
      </CardBody>
    </Card>

    <Card>
      <CardHeader title="Why the forecast may be withheld" description="Phase 9 prefers no forecast over a confident-looking guess."/>
      <CardBody>
        <ul>
          <li>The attempt must have a verified exam date; the selected attempt month alone is not enough.</li>
          <li>Recent chapter completions must meet the minimum count and observation-period requirements.</li>
          <li>Completion evidence must span multiple days and must not be stale.</li>
          <li>Self-rated understanding, XP, community reputation and future Mentor signals are excluded from the baseline forecast.</li>
        </ul>
      </CardBody>
    </Card>
  </div>;
}
