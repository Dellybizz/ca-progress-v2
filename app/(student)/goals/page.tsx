import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { GoalsClient } from "@/components/planner/goals-client";
import { PageHeader } from "@/components/ui/page-header";
import { getGoalsPageModel } from "@/lib/planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Goals | CA Progress" };
export default async function Page() { const model = await getGoalsPageModel(); if (model.mode === "guest") return <div className="phase6-page"><LoginRequired next="/goals" title="Sign in to manage goals"/></div>; if (model.mode === "setup") return <div className="phase6-page"><PageHeader preview={false} eyebrow="Goals" title="Complete your academic profile first." description="Goals become part of your planning calendar after setup."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>; return <div className="phase6-page"><PageHeader preview={false} eyebrow="Goals" title="Set milestones with real due dates." description="Goals are normalized milestones with explicit active/completed state." actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/calendar">Calendar</Link></div>}/><GoalsClient goals={model.goals}/></div>; }
