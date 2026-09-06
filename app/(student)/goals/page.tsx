import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { GoalsClient } from "@/components/planner/goals-client";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getGoalsPageModel } from "@/lib/planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Goals | CA Progress" };

export default async function Page() {
  const model = await getGoalsPageModel();
  if (model.mode === "guest") return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Goals" title="Set measurable study milestones." description="Browse the goals page as a guest. Saving personal milestones requires sign-in." actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/calendar">Calendar</Link></div>}/>
    <Card><CardBody><div className="phase6-empty"><Icon name="target"/><strong>Goals preview</strong><p>Goals are personal, so they become editable after sign-in.</p></div></CardBody></Card>
    <LoginRequired next="/goals" title="Sign in to manage goals"/>
  </div>;
  if (model.mode === "setup") return <div className="phase6-page"><PageHeader preview={false} eyebrow="Goals" title="Complete your academic profile first." description="Goals become part of Today, Calendar and Analytics after setup."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  return <div className="phase6-page"><PageHeader preview={false} eyebrow="Goals" title="Set measurable study milestones." description="Study-minute, completion, revision and test goals advance from your recorded work and use the same values in Today and Analytics." actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/calendar">Calendar</Link></div>}/><GoalsClient goals={model.goals}/></div>;
}
