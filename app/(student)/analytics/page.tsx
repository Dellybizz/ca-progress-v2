import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getProgressPageModel } from "@/lib/progress/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics | CA Progress" };

function Meter({ value }: { value: number }) {
  return <div className="analytics-meter" aria-label={`${value}%`}><span style={{ width: `${value}%` }}/></div>;
}

export default async function AnalyticsPage() {
  const model = await getProgressPageModel();
  if (model.mode === "guest") return <div className="progress-page"><LoginRequired next="/analytics" title="Sign in to view private analytics"/></div>;
  if (model.mode === "setup") return <div className="progress-page"><PageHeader preview={false} eyebrow="Analytics" title="Complete your academic profile first." description="Analytics are scoped to your applicable chapters and verified attempt."/><Link className="ui-button ui-button--primary" href="/settings/profile">Review profile</Link></div>;
  const analytics = model.analytics;
  return (
    <div className="progress-page analytics-page">
      <PageHeader preview={false} eyebrow="Analytics" title="Progress analytics from the rows you actually saved." description={`${model.levelName} · ${model.groupLabel} · ${model.attemptKey}. No manually maintained totals are used.`} actions={<Link className="dashboard-header-link" href="/progress">Open tracker</Link>}/>
      <section className="analytics-hero-grid">
        <Card><CardBody><span>Overall stage progress</span><strong>{analytics.overallPercent}%</strong><Meter value={analytics.overallPercent}/><small>Completed + revisions + tests across {analytics.chapterCount} chapters</small></CardBody></Card>
        <Card><CardBody><span>Completion</span><strong>{analytics.completionPercent}%</strong><Meter value={analytics.completionPercent}/><small>{analytics.completedCount} chapters completed</small></CardBody></Card>
        <Card><CardBody><span>Revision coverage</span><strong>{analytics.revisionPercent}%</strong><Meter value={analytics.revisionPercent}/><small>{analytics.revision1Count} first · {analytics.revision2Count} second revisions</small></CardBody></Card>
        <Card><CardBody><span>Test coverage</span><strong>{analytics.testPercent}%</strong><Meter value={analytics.testPercent}/><small>{analytics.test1Count} Test 1 · {analytics.test2Count} Test 2</small></CardBody></Card>
      </section>
      <section className="analytics-grid">
        <Card>
          <CardHeader title="This week" description="Derived from accepted progress events, excluding changes later undone." action={<Badge tone="brand">7 days</Badge>}/>
          <CardBody><div className="analytics-consistency"><div><Icon name="sparkles"/><strong>{analytics.stagesAddedLast7Days}</strong><span>stages added</span></div><div><Icon name="calendar"/><strong>{analytics.activeDaysLast7Days}</strong><span>active days</span></div></div></CardBody>
        </Card>
        <Card>
          <CardHeader title="Group progress" description="Aggregated directly from chapter rows."/>
          <CardBody><div className="analytics-list">{analytics.groups.map((group) => <div key={group.code}><span><strong>{group.name}</strong><small>{group.completedCount}/{group.chapterCount} chapters completed</small></span><b>{group.overallPercent}%</b><Meter value={group.overallPercent}/></div>)}</div></CardBody>
        </Card>
      </section>
      <Card>
        <CardHeader title="Subject progress" description="Completion, revision and test coverage by applicable subject."/>
        <CardBody><div className="analytics-subject-table">{analytics.subjects.map((subject) => <Link key={subject.id} href={`/subjects/${subject.slug}/progress`}><span><strong>{subject.title}</strong><small>{subject.groupName} · {subject.chapterCount} chapters</small></span><span><em>Done {subject.completionPercent}%</em><em>Rev {subject.revisionPercent}%</em><em>Tests {subject.testPercent}%</em></span><b>{subject.overallPercent}%</b><Icon name="chevron" size={16}/></Link>)}</div></CardBody>
      </Card>
    </div>
  );
}
