import Link from "next/link";
import { ProductPreviewPage } from "@/components/mock/product-preview";
import { Card, CardBody } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

export default function Page() {
  return <div className="settings-v2-page"><Card className="settings-profile-entry"><CardBody><span className="settings-profile-entry__icon"><Icon name="shield"/></span><div><strong>Profile & onboarding settings</strong><p>Manage your display name, private avatar, CA level, group, attempt and daily target.</p></div><Link className="ui-button ui-button--secondary ui-button--md" href="/settings/profile"><span>Open profile</span><Icon name="arrow" size={16}/></Link></CardBody></Card><ProductPreviewPage variant="settings"/></div>;
}
