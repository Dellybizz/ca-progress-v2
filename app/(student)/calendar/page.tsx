import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { CalendarClient } from "@/components/planner/calendar-client";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getCalendarPageModel } from "@/lib/planner/calendar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar | CA Progress" };

function countdownText(days: number | null, label: string | null) {
  if (days === null) return "Verified attempt date unavailable";
  if (days < 0) return `${label ?? "Selected attempt"} has passed`;
  if (days === 0) return `${label ?? "Selected attempt"} starts today`;
  return `${days} days to ${label ?? "selected attempt"}`;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const query = await searchParams;
  const model = await getCalendarPageModel(query.month);
  if (model.mode === "guest") return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Calendar" title="One calendar for your study system." description="Browse the calendar layout as a guest. Personal tasks, goals and events appear after sign-in." actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/goals">Goals</Link></div>}/>
    <Card><CardBody><div className="phase6-empty"><Icon name="calendar"/><strong>Calendar preview</strong><p>Verified public exam information can be viewed, while personal calendar items require sign-in.</p></div></CardBody></Card>
    <LoginRequired next="/calendar" title="Sign in to manage your study calendar"/>
  </div>;
  if (model.mode === "setup") return <div className="phase6-page"><PageHeader preview={false} eyebrow="Calendar" title="Complete your academic profile first." description="Your selected attempt determines which verified official exam events belong on the calendar."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>;
  return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Calendar" title="One calendar for study and real-life commitments." description={`Fixed times, flexible study targets, goals, personal events and verified attempt events are composed in ${model.timezone}.`} actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/goals">Goals</Link></div>}/>
    <Card><CardBody><div className="phase6-task-title"><strong>{countdownText(model.countdown.daysRemaining, model.countdown.attemptLabel)}</strong><span className="phase6-kind">{model.countdown.milestone === "normal" ? "Countdown" : `${model.countdown.milestone}-day state`}</span></div><p>The countdown uses only the verified attempt selected in your academic profile.</p></CardBody></Card>
    <CalendarClient month={model.month} items={model.items}/>
  </div>;
}
