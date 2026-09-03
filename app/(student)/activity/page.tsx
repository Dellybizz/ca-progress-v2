import type { Metadata } from "next";
import Link from "next/link";
import { LoginRequired } from "@/components/auth/login-required";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getActivityPageModel } from "@/lib/planner/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity | CA Progress" };
export default async function Page() { const model = await getActivityPageModel(); if (model.mode === "guest") return <div className="phase6-page">
  <PageHeader preview={false} eyebrow="Activity" title="Your study and progress history." description="Browse the activity page as a guest. Your personal timeline appears after sign-in." actions={<div className="phase6-header-links"><Link href="/study">Study</Link><Link href="/progress">Progress</Link></div>}/>
  <Card><CardBody><div className="phase6-empty"><Icon name="sparkles"/><strong>Activity preview</strong><p>There is no guest activity history. Sign in to record study and progress events.</p></div></CardBody></Card>
  <LoginRequired next="/activity" title="Sign in to view your private activity"/>
</div>; return <div className="phase6-page"><PageHeader preview={false} eyebrow="Activity" title="Your study and progress history, generated automatically." description="This timeline is composed from completed study sessions and normalized progress events — no duplicate activity log is maintained." actions={<div className="phase6-header-links"><Link href="/study">Study</Link><Link href="/progress">Progress</Link></div>}/><Card><CardBody>{model.items.length ? <div className="phase6-activity-list">{model.items.map((item) => <Link key={item.id} href={item.href}><span className={`phase6-activity-icon phase6-activity-icon--${item.source}`}><Icon name={item.source === "study" ? "timer" : "chart"}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><time>{new Date(item.occurredAt).toLocaleString()}</time><Icon name="chevron" size={16}/></Link>)}</div> : <div className="phase6-empty"><Icon name="sparkles"/><strong>No activity yet</strong><p>Finish a study timer or update chapter progress and it will appear here automatically.</p></div>}</CardBody></Card></div>; }
