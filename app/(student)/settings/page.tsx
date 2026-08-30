import Link from "next/link";
import { ProductPreviewPage } from "@/components/mock/product-preview";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

export const dynamic = "force-dynamic";

export default function Page() {
  return <div className="settings-v2-page"><Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="shield"/></span><div><strong>Profile & onboarding settings</strong><p>Manage your display name, private avatar, CA level, group, attempt and daily target.</p></div><Link className="ui-button ui-button--secondary ui-button--md" href="/settings/profile"><span>Open profile</span><Icon name="arrow" size={16}/></Link></CardBody></Card><Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="sparkles"/></span><div><strong>Plan & billing</strong><p>Review Free, Basic and Pro, your validity period, payment history and secure Razorpay checkout state.</p></div><div className="phase11-header-links"><Link href="/pricing">Plans</Link><Link href="/billing">Billing</Link></div></CardBody></Card><ProductPreviewPage variant="settings"/></div>;
}
