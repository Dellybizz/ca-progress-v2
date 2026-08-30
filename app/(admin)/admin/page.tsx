import Link from "next/link";
import { AdminDenied, HealthBadge } from "@/components/admin/admin-access";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getOperationsHealth, requireAdminOperator } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let operator;
  try { operator = await requireAdminOperator("admin"); }
  catch { return <AdminDenied message="Admin, owner or parent-owner access is required for the operations overview. Moderators can continue to their scoped moderation queues."/>; }
  const health = await getOperationsHealth(operator);
  const actions = [
    ["Members","/admin/members","Manage operator roles and inspect subscriptions.","community"],
    ["ICAI Sync","/admin/icai-sync","Review source health, sync runs and pending decisions.","bell"],
    ["Moderation","/admin/community/moderation","Handle reports, blocks and content safety actions.","shield"],
    ["Content","/admin/content","Control syllabus, attempt and ICAI resource states.","book"],
    ["Plans","/admin/plans","Configure paid plans and entitlement rules.","sparkles"],
    ["Platform","/admin/platform","Feature switches, maintenance and service health.","settings"],
    ["Notifications","/admin/notifications","Create reusable operations notification templates.","bell"],
    ["Audit Log","/admin/audit","Inspect immutable privileged change history.","notes"],
  ] as const;
  return <div className="phase12-page">
    <PageHeader preview={false} eyebrow={`Operations · ${operator.role.replace("_"," ")}`} title="Admin control center" description="A server-authorized operations workspace for members, content, billing configuration, moderation, ICAI sync and platform health."/>

    <section className="phase12-metric-grid" aria-label="Operations summary">
      <Card><CardBody><span>Members</span><strong>{health.counts.members.toLocaleString("en-IN")}</strong><small>Server-paginated directory</small></CardBody></Card>
      <Card><CardBody><span>Open reports</span><strong>{health.counts.openReports}</strong><small>Community moderation</small></CardBody></Card>
      <Card><CardBody><span>Pending resources</span><strong>{health.counts.pendingResources}</strong><small>Uploaded-note review</small></CardBody></Card>
      <Card><CardBody><span>Failed payments</span><strong>{health.counts.failedPayments}</strong><small>Current V2 billing history</small></CardBody></Card>
    </section>

    <Card>
      <CardHeader title="System health" description={`Checked ${new Date(health.checkedAt).toLocaleString("en-IN")}`}/>
      <CardBody><div className="phase12-health-grid">
        {Object.entries(health.checks).map(([name,state]) => <div key={name}><span>{name === "razorpay" ? "Razorpay" : name === "icai" ? "ICAI sync" : name[0].toUpperCase()+name.slice(1)}</span><HealthBadge state={state}/></div>)}
      </div><div className="phase12-health-detail"><div><Icon name="bell"/><span><strong>Latest ICAI run</strong><small>{health.icai.latestSync ? `${String((health.icai.latestSync as { status?: unknown }).status ?? "unknown")} · ${new Date(String((health.icai.latestSync as { started_at?: unknown }).started_at ?? health.checkedAt)).toLocaleString("en-IN")}` : "No sync run recorded"}</small></span></div><div><Icon name="shield"/><span><strong>Razorpay configuration</strong><small>{health.razorpay.providerConfigured ? "Provider credentials detected in the private billing Worker" : "Provider credentials are not configured"}{health.razorpay.webhookConfigured ? " · webhook configured" : " · webhook not configured"}</small></span></div></div></CardBody>
    </Card>

    <section className="phase12-action-grid">{actions.map(([label,href,description,icon]) => <Link key={href} href={href} className="phase12-action-card"><span><Icon name={icon}/></span><div><strong>{label}</strong><p>{description}</p></div><Icon name="arrow" size={16}/></Link>)}</section>
  </div>;
}
