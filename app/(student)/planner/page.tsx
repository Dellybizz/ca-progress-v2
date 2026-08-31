import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { PlannerClient } from "@/components/planner/planner-client";
import { PageHeader } from "@/components/ui/page-header";
import { getPlannerPageModel } from "@/lib/planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planner | CA Progress" };

export default async function Page() {
  const model = await getPlannerPageModel();
  if (model.mode === "guest") return <div className="phase6-page"><LoginRequired next="/planner" title="Sign in to plan your study day"/></div>;
  if (model.mode === "setup") return <div className="phase6-page"><PageHeader preview={false} eyebrow="Planner" title="Complete your academic profile first." description="Planner subjects and chapters follow the course, group and attempt selected in your profile."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  return <div className="phase6-page"><PageHeader preview={false} eyebrow="Planner" title="Plan manually or let the smart engine rank today." description="Create your own tasks, then use smart recommendations, revision scheduling and forecasts to keep the day realistic." actions={<div className="phase6-header-links"><Link href="/planner/today">Today Plan</Link><Link href="/planner/revision-settings">Revision settings</Link><Link href="/analytics/forecast">Forecast</Link><Link href="/goals">Goals</Link><Link href="/calendar">Calendar</Link></div>}/><PlannerClient model={model}/></div>;
}
