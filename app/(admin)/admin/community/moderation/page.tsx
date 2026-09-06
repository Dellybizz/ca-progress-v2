import type { Metadata } from "next";
import { CommunityModerationConsole } from "@/components/community/moderation-console";
import { CommunityVerificationConsole } from "@/components/community/verification-console";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getCommunityVerificationAdminModel } from "@/lib/community/phase7";
import { getCommunityModerationModel } from "@/lib/community/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Community Moderation | CA Progress" };

export default async function CommunityModerationPage() {
  const [model, verification] = await Promise.all([getCommunityModerationModel(), getCommunityVerificationAdminModel()]);
  if (model.mode === "denied") return <div className="phase10-page"><section className="phase10-denied"><span><Icon name="shield" size={28}/></span><h1>Community moderation is restricted</h1><p>Moderator, admin, owner or parent owner access is required.</p></section></div>;
  return <div className="phase10-page"><PageHeader preview={false} eyebrow="Admin · Community" title="Community moderation & verification" description="Review reports, enforce temporary chat blocks, manage evidence-backed verification where authorized, and retain an audit trail for sensitive actions."/>{verification ? <CommunityVerificationConsole model={verification}/> : null}<CommunityModerationConsole model={model}/></div>;
}
