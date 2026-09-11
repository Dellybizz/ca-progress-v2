import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { CalendarClient } from "@/components/planner/calendar-client";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { optionalUser } from "@/lib/auth/server";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";
import { getCalendarPageModel } from "@/lib/planner/calendar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar | CA Progress" };

function countdownText(days: number | null, label: string | null, status: "upcoming" | "exam_period" | "completed" | "unavailable") {
  if (status === "exam_period") return "Exam period";
  if (status === "completed") return "Exam completed";
  if (days === null) return "Verified attempt date unavailable";
  if (days < 0) return `${label ?? "Selected attempt"} has passed`;
  if (days === 0) return `${label ?? "Selected attempt"} starts today`;
  return `${days} days to ${label ?? "selected attempt"}`;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const identity = await optionalUser();
  if (identity) {
    const access = await getPlanFeatureAccessForUser(identity.id, "advanced_planner_calendar");
    if (!access.allowed) return <div className="phase6-page">
      <PageHeader preview={false} eyebrow="Calendar · Pro" title="Add the full calendar when you need it." description="Free keeps Today and core planning usable. Pro adds the personal Calendar workspace and its private event mutations." actions={<div className="phase6-header-links"><Link href="/planner">Use Free Planner</Link><Link href="/pricing">Compare plans</Link></div>}/>
      <Card><CardBody><div className="phase6-empty"><Icon name="lock"/><strong>Personal Calendar is a Pro upgrade</strong><p>Your existing study data is unchanged. Upgrade only if you want calendar planning beyond the Free Today/task loop.</p><Link className="ui-button ui-button--primary" href="/pricing">See Pro features</Link></div></CardBody></Card>
    </div>;
  }
  const query = await searchParams;
  const model = await getCalendarPageModel(query.month);
  if (model.mode === "guest") return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Calendar" title="One calendar for your study system." description="Browse the calendar layout as a guest. Personal tasks, goals and events appear after sign-in." actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/goals">Goals</Link></div>}/>
    <Card><CardBody><div className="phase6-empty"><Icon name="calendar"/><strong>Calendar preview</strong><p>Verified public exam information can be viewed, while personal calendar items require sign-in and Pro calendar access.</p></div></CardBody></Card>
    <LoginRequired next="/calendar" title="Sign in to manage your study calendar"/>
  </div>;
  if (model.mode === "setup") return <div className="phase6-page"><PageHeader preview={false} eyebrow="Calendar" title="Complete your academic profile first." description="Your selected attempt determines which verified official exam events belong on the calendar."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Calendar" title="One calendar for study and real-life commitments." description={`Fixed times, flexible study targets, goals, personal events and verified attempt events are composed in ${model.timezone}.`} actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/goals">Goals</Link></div>}/>
    <Card><CardBody><div className="phase6-task-title"><strong>{countdownText(model.countdown.daysRemaining, model.countdown.attemptLabel, model.countdown.periodStatus)}</strong><span className="phase6-kind">{model.countdown.periodStatus === "upcoming" && model.countdown.milestone !== "normal" ? `${model.countdown.milestone}-day state` : "Countdown"}</span></div><p>Official ICAI dates take priority; an admin provisional period is used until verified dates arrive.</p></CardBody></Card>
    <CalendarClient month={model.month} items={model.items}/>
  </div>;
}
