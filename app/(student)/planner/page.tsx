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

  if (model.mode === "guest") {
    return <div className="phase6-page planner-page"><LoginRequired next="/planner" title="Sign in to plan your study day"/></div>;
  }

  if (model.mode === "setup") {
    return <div className="phase6-page planner-page"><PageHeader preview={false} eyebrow="Planner" title="Set up your study plan." description="Choose your CA level, group and attempt first so Planner can show the right subjects."/><Link href="/settings/profile" className="ui-button ui-button--primary">Complete setup</Link></div>;
  }

  return (
    <div className="phase6-page planner-page">
      <PageHeader
        preview={false}
        eyebrow="Planner"
        title="Plan your study day."
        actions={<div className="phase6-header-links planner-header-links"><Link href="/planner/today">Today Plan</Link><Link href="/calendar">Calendar</Link></div>}
      />
      <PlannerClient model={model}/>
    </div>
  );
}
