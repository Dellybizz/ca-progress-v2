import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { GoalsClient } from "@/components/planner/goals-client";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { optionalUser } from "@/lib/auth/server";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";
import { getGoalsPageModel } from "@/lib/planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Goals | CA Progress" };

export default async function Page() {
  const identity = await optionalUser();
  if (identity) {
    const access = await getPlanFeatureAccessForUser(identity.id, "detailed_goals_reports");
    if (!access.allowed) return <div className="phase6-page">
      <PageHeader preview={false} eyebrow="Goals · Pro" title="Keep daily planning Free; add detailed goals when useful." description="Free Today/tasks remain available. Pro adds measurable cross-surface goals and goal reporting." actions={<div className="phase6-header-links"><Link href="/planner">Use Free Planner</Link><Link href="/pricing">Compare plans</Link></div>}/>
      <Card><CardBody><div className="phase6-empty"><Icon name="lock"/><strong>Detailed Goals are a Pro upgrade</strong><p>Nothing is deleted if you downgrade. Existing account data remains preserved while new paid goal actions stay locked.</p><Link className="ui-button ui-button--primary" href="/pricing">See Pro features</Link></div></CardBody></Card>
    </div>;
  }
  const model = await getGoalsPageModel();
  if (model.mode === "guest") return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Goals" title="Set measurable study milestones." description="Browse the goals page as a guest. Saving detailed personal milestones requires sign-in and Pro access." actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/calendar">Calendar</Link></div>}/>
    <Card><CardBody><div className="phase6-empty"><Icon name="target"/><strong>Goals preview</strong><p>Free Today/tasks remain usable; detailed cross-surface goals are a Pro upgrade.</p></div></CardBody></Card>
    <LoginRequired next="/goals" title="Sign in to review plan access"/>
  </div>;
  if (model.mode === "setup") return <div className="phase6-page"><PageHeader preview={false} eyebrow="Goals" title="Complete your academic profile first." description="Goals become part of Today, Calendar and Analytics after setup."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  return <div className="phase6-page"><PageHeader preview={false} eyebrow="Goals" title="Set measurable study milestones." description="Study-minute, completion, revision and test goals advance from your recorded work and use the same values in Today and Analytics." actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/calendar">Calendar</Link></div>}/><GoalsClient goals={model.goals}/></div>;
}
