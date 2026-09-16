import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getBillingModel } from "@/lib/billing/service";
import { getRecurringBillingState } from "@/lib/billing/recurring-service";
import { canUseExport, exportProductPlanLabel } from "@/lib/exports/policy.mjs";
import { OfflineControls } from "@/components/offline/offline-controls";
import { AppearanceControls } from "@/components/preferences/appearance-controls";
import { FocusPreferences } from "@/components/preferences/focus-preferences";

export const dynamic = "force-dynamic";
function paidThroughLabel(value:string|null|undefined){if(!value)return null;const date=new Date(value);if(Number.isNaN(date.getTime()))return null;return new Intl.DateTimeFormat("en-IN",{dateStyle:"medium"}).format(date);}
export default async function Page(){
  const [billing, recurring] = await Promise.all([getBillingModel(), getRecurringBillingState()]);
  const tier = billing.currentPlan?.tier_key ?? "free";
  const planLabel = exportProductPlanLabel(tier);
  const billingReady = billing.mode === "ready";
  const canExportProgress = billingReady && canUseExport(tier, "progress_pdf");
  const canExportStudy = billingReady && canUseExport(tier, "study_csv");
  const canExportTests = billingReady && canUseExport(tier, "test_history_csv");
  const canExportBackup = billingReady && canUseExport(tier, "full_backup");
  const paidThrough = paidThroughLabel(billing.currentSubscription?.ends_at);
  const lifecycleNotice=recurring.mode==="ready"&&recurring.subscription?`Recurring billing: ${recurring.subscription.status}${recurring.subscription.chargeAt?` · next provider charge ${paidThroughLabel(recurring.subscription.chargeAt)}`:""}.`:billing.currentSubscription?.status==="cancelled"&&paidThrough?`Cancelled — paid access remains active through ${paidThrough}. Free limits apply after that unless you start a new subscription.`:billing.currentSubscription?.status==="paused"&&paidThrough?`Billing grace period — paid access remains active through ${paidThrough}. Free limits apply after that unless provider billing is restored.`:null;
  return <div className="settings-v2-page"><Card><CardHeader title="Appearance" description="Choose how CA Progress looks and moves on this device."/><CardBody><AppearanceControls/></CardBody></Card><Card><CardHeader title="Focus" description="Choose what happens when a Focus session finishes on this device."/><CardBody><FocusPreferences/></CardBody></Card><Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="shield"/></span><div><strong>Profile & onboarding settings</strong><p>Manage your display name, private avatar, CA level, group, attempt and daily target.</p></div><Link className="ui-button ui-button--secondary ui-button--md" href="/settings/profile"><span>Open profile</span><Icon name="arrow" size={16}/></Link></CardBody></Card><Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="sparkles"/></span><div><strong>Plan & billing</strong><p>Review Free, Pro and Premium, recurring Razorpay state, paid-through access, payment history and cancellation controls.</p>{lifecycleNotice?<p>{lifecycleNotice}</p>:null}<p>Downgrading never deletes your existing files; existing files stay available, but new uploads pause until you reduce usage or upgrade. Paid-plan changes are scheduled for the verified billing-cycle end.</p></div><div className="phase11-header-links"><Link href="/pricing">Plans</Link><Link href="/billing">Billing</Link></div></CardBody></Card><Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="notes"/></span><div><strong>Data export</strong><p>{planLabel} plan</p></div><div className="phase11-header-links">{canExportProgress?<a href="/api/exports/progress" download>Progress PDF</a>:<Link href="/login">Sign in to export</Link>}{canExportStudy ? <a href="/api/exports/study" download>Study CSV</a>:<span aria-disabled="true">Study CSV · Pro</span>}{canExportTests ? <a href="/api/exports/tests" download>Test History CSV</a>:<span aria-disabled="true">Test History CSV · Pro</span>}{canExportBackup ? <a href="/api/exports/backup" download>Full Backup</a>:<span aria-disabled="true">Full Backup · Premium</span>}</div></CardBody></Card><Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="book"/></span><div><strong>Offline data on this device</strong><p>Cached student screens and queued edits are isolated to your signed-in account. Admin, billing and temporary file links are never stored.</p></div><OfflineControls/></CardBody></Card></div>;
}
