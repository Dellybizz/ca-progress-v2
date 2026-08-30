import { AdminDenied, HealthBadge } from "@/components/admin/admin-access";
import { FeatureFlagToggle, MaintenanceControl } from "@/components/admin/operations-controls";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { canManagePlatform, getOperationsHealth, getPlatformModel, requireAdminOperator } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  let operator;
  try { operator = await requireAdminOperator("admin"); }
  catch { return <AdminDenied message="Admin, owner or parent-owner access is required for platform operations."/>; }
  const [platform,health] = await Promise.all([getPlatformModel(),getOperationsHealth(operator)]);
  const canEdit = canManagePlatform(operator.role);
  return <div className="phase12-page"><PageHeader preview={false} eyebrow="Operations · Platform" title="Feature switchboard and maintenance" description="Kill switches are enforced on server mutation paths. Maintenance blocks normal member mutations while privileged operators retain recovery access."/>
    <section className="phase12-two-col"><Card><CardHeader title="Feature switches" description={canEdit ? "Owner-level audited controls" : "View only for your role"}/><CardBody><div className="phase12-flag-list">{platform.flags.map((raw) => { const flag=raw as {flag_key:string;label:string;description:string;enabled:boolean}; return <div key={flag.flag_key}><div><strong>{flag.label}</strong><p>{flag.description}</p><code>{flag.flag_key}</code></div><FeatureFlagToggle flagKey={flag.flag_key} enabled={flag.enabled} canEdit={canEdit}/></div>; })}</div></CardBody></Card><Card><CardHeader title="Maintenance mode" description="User-facing write protection"/><CardBody><MaintenanceControl initial={platform.maintenance as never} canEdit={canEdit}/></CardBody></Card></section>
    <Card><CardHeader title="Service health" description="Supabase/Auth/Storage/Realtime/Razorpay/ICAI operational probes"/><CardBody><div className="phase12-health-grid">{Object.entries(health.checks).map(([key,state]) => <div key={key}><span>{key}</span><HealthBadge state={state}/></div>)}</div></CardBody></Card>
  </div>;
}
