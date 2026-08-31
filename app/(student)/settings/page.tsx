import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default function Page() {
  return <div className="settings-v2-page product-page">
    <Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="shield"/></span><div><strong>Profile & onboarding settings</strong><p>Manage your display name, private avatar, CA level, group, attempt and daily target.</p></div><Link className="ui-button ui-button--secondary ui-button--md" href="/settings/profile"><span>Open profile</span><Icon name="arrow" size={16}/></Link></CardBody></Card>
    <Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="sparkles"/></span><div><strong>Plan & billing</strong><p>Review Free, Basic and Pro, your validity period, payment history and secure Razorpay checkout state.</p></div><div className="phase11-header-links"><Link href="/pricing">Plans</Link><Link href="/billing">Billing</Link></div></CardBody></Card>
    <PageHeader preview={false} eyebrow="Settings" title="Preferences that make the workspace feel yours." description="Review your workspace appearance defaults and the accessibility behavior used throughout CA Progress." actions={<Badge tone="brand"><Icon name="settings" size={14}/>Personalize</Badge>}/>
    <div className="settings-preview">
      <Card><CardHeader title="Appearance" description="Workspace display defaults"/><CardBody><div className="context-list"><div><span>Theme</span><strong>System</strong></div><div><span>Density</span><strong>Comfortable</strong></div><div><span>Accent</span><strong>Indigo</strong></div></div><p className="card-copy">CA Progress follows your device theme by default and keeps spacing optimized for comfortable study sessions.</p></CardBody></Card>
      <Card><CardHeader title="Accessibility" description="Built into the workspace"/><CardBody><div className="accessibility-list"><div><Icon name="check"/><span><strong>Visible focus rings</strong><small>Keyboard navigation always shows the active control.</small></span></div><div><Icon name="check"/><span><strong>Touch-friendly controls</strong><small>Primary controls use comfortable minimum tap targets.</small></span></div><div><Icon name="check"/><span><strong>Reduced-motion support</strong><small>Motion follows your system accessibility preference.</small></span></div></div></CardBody></Card>
    </div>
  </div>;
}
