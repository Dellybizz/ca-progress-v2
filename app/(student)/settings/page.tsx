import Link from "next/link";
import { ProductPreviewPage } from "@/components/mock/product-preview";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getBillingModel } from "@/lib/billing/service";
import { canUseExport, exportProductPlanLabel } from "@/lib/exports/policy.mjs";

export const dynamic = "force-dynamic";

function paidThroughLabel(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

export default async function Page() {
  const billing = await getBillingModel();
  const tier = billing.currentPlan?.tier_key ?? "free";
  const planLabel = exportProductPlanLabel(tier);
  const billingReady = billing.mode === "ready";
  const canExportProgress = billingReady && canUseExport(tier, "progress_pdf");
  const canExportStudy = billingReady && canUseExport(tier, "study_csv");
  const canExportTests = billingReady && canUseExport(tier, "test_history_csv");
  const canExportBackup = billingReady && canUseExport(tier, "full_backup");
  const paidThrough = paidThroughLabel(billing.currentSubscription?.ends_at);
  const lifecycleNotice = billing.currentSubscription?.status === "cancelled" && paidThrough
    ? `Cancelled — paid access remains active through ${paidThrough}. Free limits apply after that unless you renew.`
    : billing.currentSubscription?.status === "paused" && paidThrough
      ? `Billing grace period — paid access remains active through ${paidThrough}. Free limits apply after that unless billing is restored.`
      : null;

  return <div className="settings-v2-page">
    <Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="shield"/></span><div><strong>Profile & onboarding settings</strong><p>Manage your display name, private avatar, CA level, group, attempt and daily target.</p></div><Link className="ui-button ui-button--secondary ui-button--md" href="/settings/profile"><span>Open profile</span><Icon name="arrow" size={16}/></Link></CardBody></Card>
    <Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="sparkles"/></span><div><strong>Plan & billing</strong><p>Review Free, Pro and Premium, your validity period, payment history and secure Razorpay checkout state.</p>{lifecycleNotice ? <p>{lifecycleNotice}</p> : null}<p>Downgrading never deletes your existing files. If your stored files exceed the new plan limit, existing files stay available, but new uploads pause until you reduce usage or upgrade.</p></div><div className="phase11-header-links"><Link href="/pricing">Plans</Link><Link href="/billing">Billing</Link></div></CardBody></Card>
    <Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="notes"/></span><div><strong>Data export</strong><p>{planLabel} plan</p></div><div className="phase11-header-links">{canExportProgress ? <a href="/api/exports/progress" download>Progress PDF</a> : <Link href="/login">Sign in to export</Link>}{canExportStudy ? <a href="/api/exports/study" download>Study CSV</a> : <span aria-disabled="true">Study CSV · Pro</span>}{canExportTests ? <a href="/api/exports/tests" download>Test History CSV</a> : <span aria-disabled="true">Test History CSV · Pro</span>}{canExportBackup ? <a href="/api/exports/backup" download>Full Backup</a> : <span aria-disabled="true">Full Backup · Premium</span>}</div></CardBody></Card>
    <ProductPreviewPage variant="settings"/>
  </div>;
}
