import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { CalendarClient } from "@/components/planner/calendar-client";
import { PageHeader } from "@/components/ui/page-header";
import { getCalendarPageModel } from "@/lib/planner/calendar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar | CA Progress" };
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) { const query = await searchParams; const model = await getCalendarPageModel(query.month); if (model.mode === "guest") return <div className="phase6-page">
  <PageHeader preview={false} eyebrow="Calendar" title="One calendar for your study system." description="Browse the calendar layout as a guest. Personal tasks, goals and events appear after sign-in." actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/goals">Goals</Link></div>}/>
  <Card><CardBody><div className="phase6-empty"><Icon name="calendar"/><strong>Calendar preview</strong><p>Verified public exam information can be viewed, while personal calendar items require sign-in.</p></div></CardBody></Card>
  <LoginRequired next="/calendar" title="Sign in to manage your study calendar"/>
</div>; if (model.mode === "setup") return <div className="phase6-page"><PageHeader preview={false} eyebrow="Calendar" title="Complete your academic profile first." description="Your selected attempt determines which verified official exam events belong on the calendar."/><Link href="/settings/profile" className="ui-button ui-button--primary">Review profile</Link></div>; return <div className="phase6-page"><PageHeader preview={false} eyebrow="Calendar" title="One calendar, composed from the real sources." description="Tasks, goals and personal events stay editable. Verified ICAI exam events remain read-only and linked to provenance." actions={<div className="phase6-header-links"><Link href="/planner">Planner</Link><Link href="/goals">Goals</Link></div>}/><CalendarClient month={model.month} items={model.items}/></div>; }
