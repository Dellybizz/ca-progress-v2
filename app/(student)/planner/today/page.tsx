import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { FeatureLock } from "@/components/billing/feature-lock";
import { TodayPlanClient } from "@/components/planner/today-plan-client";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { optionalUser } from "@/lib/auth/server";
import { getEntitlementForUser } from "@/lib/billing/service";
import { getTodayPlanDisplayModel } from "@/lib/smart-planner/today-display";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today Plan | CA Progress" };

function formatPlanDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default async function TodayPlanPage() {
  const identity = await optionalUser();
  if (identity) {
    const access = await getEntitlementForUser(identity.id, "planner.smart");
    if (!access.allowed) return <div className="phase9-page"><PageHeader preview={false} eyebrow="Smart Planner" title="Smart planning is not included in your current plan." description="Your existing progress and manual planner data remain available."/><FeatureLock planName={access.planName} title="Unlock Smart Planner" description={access.upgradeMessage || "Compare plans to enable explainable daily recommendations."}/></div>;
  }
  const model = await getTodayPlanDisplayModel();
  if (model.mode === "guest") return <div className="phase9-page">
    <PageHeader preview={false} eyebrow="Today" title="Today’s study plan" description="Browse the Today Plan page as a guest. A personal plan is generated only after sign-in."/>
    <Card><CardBody><div className="phase6-empty"><Icon name="calendar"/><strong>Today Plan preview</strong><p>Sign in to generate and save tasks for your own schedule.</p></div></CardBody></Card>
    <LoginRequired next="/planner/today" title="Sign in to generate your Today Plan"/>
  </div>;
  if (model.mode === "setup") return <div className="phase9-page"><PageHeader preview={false} eyebrow="Today" title="Complete your academic profile first." description="Add your CA level, group, attempt and daily study target to build your daily plan."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  return <div className="phase9-page today-plan-page"><PageHeader preview={false} eyebrow="Today" title="Today’s study plan" description={formatPlanDate(model.planDate)}/><TodayPlanClient model={model}/></div>;
}
