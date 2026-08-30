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
  catch { return <AdminDenied message="Admin access is required. Moderators can use their moderation queues."/>; }
  const health = await getOperationsHealth(operator);
  const actions = [
    ["Members","/admin/members","Roles and subscriptions.","community"],
    ["ICAI Sync","/admin/icai-sync","Sync and review health.","bell"],
    ["Moderation","/admin/community/moderation","Reports and safety actions.","shield"],
    ["Content","/admin/content","Academic content states.","book"],
    ["Plans","/admin/plans","Plans and entitlements.","sparkles"],
    ["Platform","/admin/platform","Switches and maintenance.","settings"],
    ["Notifications","/admin/notifications","Reusable templates.","bell"],
    ["Audit Log","/admin/audit","Privileged change history.","notes"],
  ] as const;
  return <div className="phase12-page">
    <PageHeader preview={false} eyebrow={`Operations · ${operator.role.replace("_"," ")}`} title="Admin control center" description="Members, content, billing, moderation and platform health."/>

    <section className="phase12-metric-grid" aria-label="Operations summary">
      <Card><CardBody><span>Members</span><strong>{health.counts.members.toLocaleString("en-IN")}</strong><small>Paginated directory</small></CardBody></Card>
      <Card><CardBody><span>Open reports</span><strong>{health.counts.openReports}</strong><small>Community</small></CardBody></Card>
      <Card><CardBody><span>Pending resources</span><strong>{health.counts.pendingResources}</strong><small>Review queue</small></CardBody></Card>
      <Card><CardBody><span>Failed payments</span><strong>{health.counts.failedPayments}</strong><small>Billing</small></CardBody></Card>
    </section>

    <Card>
      <CardHeader title="System health" description={`Checked ${new Date(health.checkedAt).toLocaleString("en-IN")}`}/>
      <CardBody><div className="phase12-health-grid">
        {Object.entries(health.checks).map(([name,state]) => <div key={name}><span>{name === "razorpay" ? "Razorpay" : name === "icai" ? "ICAI sync" : name[0].toUpperCase()+name.slice(1)}</span><HealthBadge state={state}/></div>)}
      </div><div className="phase12-health-detail"><div><Icon name="bell"/><span><strong>Latest ICAI run</strong><small>{health.icai.latestSync ? `${String((health.icai.latestSync as { status?: unknown }).status ?? "unknown")} · ${new Date(String((health.icai.latestSync as { started_at?: unknown }).started_at ?? health.checkedAt)).toLocaleString("en-IN")}` : "No run recorded"}</small></span></div><div><Icon name="shield"/><span><strong>Razorpay</strong><small>{health.razorpay.providerConfigured ? "Configured" : "Not configured"}{health.razorpay.webhookConfigured ? " · webhook ready" : " · webhook missing"}</small></span></div></div></CardBody>
    </Card>

    <section className="phase12-action-grid">{actions.map(([label,href,description,icon]) => <Link key={href} href={href} className="phase12-action-card"><span><Icon name={icon}/></span><div><strong>{label}</strong><p>{description}</p></div><Icon name="arrow" size={16}/></Link>)}</section>
  </div>;
}
