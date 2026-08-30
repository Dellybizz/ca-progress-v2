import { AdminDenied } from "@/components/admin/admin-access";
import { EntitlementControl, PlanControl } from "@/components/admin/operations-controls";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { canManagePlatform, getPlansAdminModel, requireAdminOperator } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export default async function PlansAdminPage() {
  let operator;
  try { operator = await requireAdminOperator("admin"); }
  catch { return <AdminDenied message="Admin access is required for plan configuration."/>; }
  const model = await getPlansAdminModel();
  const canEdit = canManagePlatform(operator.role);
  return <div className="phase12-page"><PageHeader preview={false} eyebrow="Operations · Billing" title="Plans and feature access" description="Owner changes are server-validated and audited."/>
    <section className="phase12-plan-admin-grid">{model.plans.map((raw) => { const plan=raw as Record<string,unknown>; return <Card key={String(plan.id)}><CardHeader title={`${String(plan.name)} · ${String(plan.billing_cycle)}`} description={`${String(plan.duration_value)} ${String(plan.duration_unit)} · ${String(plan.currency)}`}/><CardBody><PlanControl plan={plan} canEdit={canEdit}/><div className="phase12-entitlement-list">{model.entitlements.filter((item) => (item as {plan_id?:unknown}).plan_id===plan.id).map((item) => { const row=item as Record<string,unknown>; return <div key={String(row.feature_key)}><div><strong>{String(row.feature_key)}</strong><small>{String(row.upgrade_message || "No upgrade message")}</small></div><EntitlementControl row={row} canEdit={canEdit}/></div>; })}</div></CardBody></Card>; })}</section>
  </div>;
}
