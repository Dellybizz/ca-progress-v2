import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { RevisionSettingsClient } from "@/components/planner/revision-settings-client";
import { PageHeader } from "@/components/ui/page-header";
import { getRevisionSettingsPageModel } from "@/lib/smart-planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Revision Settings | CA Progress" };

export default async function RevisionSettingsPage() {
  const model = await getRevisionSettingsPageModel();
  if (model.mode === "guest") return <div className="phase9-page"><LoginRequired next="/planner/revision-settings" title="Sign in to manage revision rules"/></div>;
  if (model.mode === "setup") return <div className="phase9-page"><PageHeader preview={false} eyebrow="Revision Settings" title="Complete your academic profile first." description="Revision due dates are linked to the chapters applicable to your selected attempt."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  return <div className="phase9-page phase9-page--narrow"><PageHeader preview={false} eyebrow="Revision Settings" title="Control when completed chapters return." description="Set your revision intervals, preferred study days and default time estimates. Generated schedules remain editable." actions={<div className="phase9-header-links"><Link href="/planner/today">Today Plan</Link><Link href="/planner">Manual planner</Link></div>}/><RevisionSettingsClient settings={model.settings}/></div>;
}
