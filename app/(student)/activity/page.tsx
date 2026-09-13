import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Loading from "./loading";
import { LoginRequired } from "@/components/auth/login-required";
import { ActivityGamificationClient } from "@/components/gamification/activity-gamification-client";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { optionalUser } from "@/lib/auth/server";
import { getActivityPageModel } from "@/lib/planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity | CA Progress" };

type ActivitySearchParams = { ref?: string | string[] };

function cleanReferralCode(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return /^[A-Z0-9]{8,32}$/.test(code) ? code : "";
}

function safeActivityTime(value: unknown) {
  const date = new Date(typeof value === "string" ? value : "");
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Recorded activity";
}

export default async function ActivityPage({ searchParams }: { searchParams?: Promise<ActivitySearchParams> }) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialReferralCode = cleanReferralCode(resolvedSearchParams.ref);
  return <Suspense fallback={<Loading />}><ActivityContent initialReferralCode={initialReferralCode}/></Suspense>;
}

async function ActivityContent({ initialReferralCode }: { initialReferralCode: string }) {
  // Activity has one non-negotiable responsibility: show the student's timeline.
  // XP, leaderboard, referrals and rewards are loaded independently on the client
  // so an optional gamification/reconciliation failure can never blank this route.
  const [modelResult, userResult] = await Promise.allSettled([getActivityPageModel(), optionalUser()]);
  const user = userResult.status === "fulfilled" ? userResult.value : null;
  const model = modelResult.status === "fulfilled"
    ? modelResult.value
    : user
      ? { mode: "ready" as const, viewerName: "Student", items: [] }
      : { mode: "guest" as const };
  const timelineUnavailable = modelResult.status === "rejected";
  const nextPath = initialReferralCode ? `/activity?ref=${encodeURIComponent(initialReferralCode)}` : "/activity";

  if (model.mode === "guest" || !user) return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Activity" title="Your study and progress history." description="Browse the activity page as a guest. Your personal timeline appears after sign-in." actions={<div className="phase6-header-links"><Link href="/study">Study</Link><Link href="/progress">Progress</Link></div>}/>
    <Card><CardBody><div className="phase6-empty"><Icon name="sparkles"/><strong>Activity preview</strong><p>There is no guest activity history. Sign in to record study and progress events.</p></div></CardBody></Card>
    <LoginRequired next={nextPath} title="Sign in to view your private activity"/>
  </div>;

  const items = Array.isArray(model.items) ? model.items : [];

  return <div className="phase6-page">
    <PageHeader preview={false} eyebrow="Activity" title="Preparation momentum and activity." description="XP, levels and achievements reward meaningful preparation only. They never change syllabus progress, revision readiness or test readiness." actions={<div className="phase6-header-links"><Link href="/study">Study</Link><Link href="/progress">Progress</Link></div>}/>

    <ActivityGamificationClient initialReferralCode={initialReferralCode}/>

    <Card><CardBody>{items.length ? <div className="phase6-activity-list">{items.map((item) => <Link key={item.id} href={item.href}><span className={`phase6-activity-icon phase6-activity-icon--${item.source}`}><Icon name={item.source === "study" ? "timer" : "chart"}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><time>{safeActivityTime(item.occurredAt)}</time><Icon name="chevron" size={16}/></Link>)}</div> : <div className="phase6-empty"><Icon name="sparkles"/><strong>{timelineUnavailable ? "Activity timeline is temporarily unavailable" : "No activity yet"}</strong><p>{timelineUnavailable ? "Your source study and progress records are safe. Retry this page to load the timeline." : "Finish a study timer or update chapter progress and it will appear here automatically."}</p></div>}</CardBody></Card>
  </div>;
}
