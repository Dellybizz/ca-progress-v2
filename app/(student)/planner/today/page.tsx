import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { TodayPlanClient } from "@/components/planner/today-plan-client";
import { PageHeader } from "@/components/ui/page-header";
import { getTodayPlanPageModel } from "@/lib/smart-planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today Plan | CA Progress" };

export default async function TodayPlanPage() {
  const model = await getTodayPlanPageModel();
  if (model.mode === "guest") return <div className="phase9-page"><LoginRequired next="/planner/today" title="Sign in to generate your Today Plan"/></div>;
  if (model.mode === "setup") return <div className="phase9-page"><PageHeader preview={false} eyebrow="Smart Planner" title="Complete your academic profile first." description="The revision engine needs your CA level, group, attempt and daily target before it can make safe recommendations."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  return <div className="phase9-page"><PageHeader preview={false} eyebrow="Smart Planner" title={`Your plan for ${model.planDate}`} description="Due revisions, unfinished syllabus work, tests and your own tasks are ranked with visible reasons. Manual changes always take priority over generated suggestions." actions={<div className="phase9-header-links"><Link href="/planner/revision-settings">Revision settings</Link><Link href="/analytics/forecast">Forecast</Link><Link href="/planner">Manual planner</Link></div>}/><TodayPlanClient model={model}/></div>;
}
