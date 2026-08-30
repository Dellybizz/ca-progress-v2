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
  catch { return <AdminDenied message="Admin access required."/>; }
  const health = await getOperationsHealth(operator);
  const actions = [
    ["Members","/admin/members","community"],
    ["ICAI Sync","/admin/icai-sync","bell"],
    ["Moderation","/admin/community/moderation","shield"],
    ["Content","/admin/content","book"],
    ["Plans","/admin/plans","sparkles"],
    ["Platform","/admin/platform","settings"],
    ["Notifications","/admin/notifications","bell"],
    ["Audit Log","/admin/audit","notes"],
  ] as const;
  return <div className="phase12-page">
    <PageHeader preview={false} eyebrow={`Operations · ${operator.role.replace("_"," ")}`} title="Admin control center" description="Operations."/>
    <section className="phase12-metric-grid" aria-label="Operations summary">
      <Card><CardBody><span>Members</span><strong>{health.counts.members.toLocaleString("en-IN")}</strong></CardBody></Card>
      <Card><CardBody><span>Open reports</span><strong>{health.counts.openReports}</strong></CardBody></Card>
      <Card><CardBody><span>Pending resources</span><strong>{health.counts.pendingResources}</strong></CardBody></Card>
      <Card><CardBody><span>Failed payments</span><strong>{health.counts.failedPayments}</strong></CardBody></Card>
    </section>
    <Card>
      <CardHeader title="System health" description={`Checked ${new Date(health.checkedAt).toLocaleString("en-IN")}`}/>
      <CardBody><div className="phase12-health-grid">
        {Object.entries(health.checks).map(([name,state]) => <div key={name}><span>{name === "razorpay" ? "Razorpay" : name === "icai" ? "ICAI sync" : name[0].toUpperCase()+name.slice(1)}</span><HealthBadge state={state}/></div>)}
      </div><div className="phase12-health-detail"><div><Icon name="bell"/><span><strong>Latest ICAI run</strong><small>{health.icai.latestSync ? `${String((health.icai.latestSync as { status?: unknown }).status ?? "unknown")} · ${new Date(String((health.icai.latestSync as { started_at?: unknown }).started_at ?? health.checkedAt)).toLocaleString("en-IN")}` : "No run"}</small></span></div><div><Icon name="shield"/><span><strong>Razorpay</strong><small>{health.razorpay.providerConfigured ? "Configured" : "Not configured"}{health.razorpay.webhookConfigured ? " · webhook ready" : " · webhook missing"}</small></span></div></div></CardBody>
    </Card>
    <section className="phase12-action-grid">{actions.map(([label,href,icon]) => <Link key={href} href={href} className="phase12-action-card"><span><Icon name={icon}/></span><strong>{label}</strong><Icon name="arrow" size={16}/></Link>)}</section>
  </div>;
}
