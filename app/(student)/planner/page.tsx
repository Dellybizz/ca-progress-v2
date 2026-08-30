import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { PlannerClient } from "@/components/planner/planner-client";
import { PageHeader } from "@/components/ui/page-header";
import { getPlannerPageModel } from "@/lib/planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planner | CA Progress" };
export default async function Page() { const model = await getPlannerPageModel(); if (model.mode === "guest") return <div className="phase6-page"><LoginRequired next="/planner" title="Sign in to plan your study day"/></div>; if (model.mode === "setup") return <div className="phase6-page"><PageHeader preview={false} eyebrow="Planner" title="Complete your academic profile first." description="Planner subject and chapter links are scoped to your verified academic selection."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>; return <div className="phase6-page"><PageHeader preview={false} eyebrow="Planner" title="Turn today into a realistic study plan." description="Daily tasks store due times, types and estimated minutes as normalized rows." actions={<div className="phase6-header-links"><Link href="/goals">Goals</Link><Link href="/calendar">Calendar</Link></div>}/><PlannerClient model={model}/></div>; }
