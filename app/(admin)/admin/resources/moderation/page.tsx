import type { Metadata } from "next";
import { ModerationQueue } from "@/components/resources/moderation-queue";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { getResourceModerationPageModel } from "@/lib/resources/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resource Moderation | CA Progress" };

export default async function ResourceModerationPage() {
  const model = await getResourceModerationPageModel();
  if (model.mode === "denied") return <div className="phase7-page"><section className="phase7-permission-state"><span><Icon name="shield" size={28}/></span><Badge tone="danger">Access denied</Badge><h1>Resource moderation is restricted</h1><p>Only a moderator, admin, owner or parent owner can review shared student notes and uploads.</p></section></div>;
  return <div className="phase7-page"><PageHeader preview={false} eyebrow="Admin · Phase 7" title="Resource moderation" description="Approve or reject Community submissions, and review reports. Private student files never enter this queue."/><ModerationQueue model={model}/></div>;
}
