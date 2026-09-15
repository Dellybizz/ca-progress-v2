import type { Metadata } from "next";
import Link from "next/link";
import { PricingClient } from "@/components/billing/pricing-client";
import { PageHeader } from "@/components/ui/page-header";
import { getPricingModel } from "@/lib/billing/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plans & Pricing | CA Progress" };

export default async function PricingPage() {
  const model = await getPricingModel();
  return <div className="phase11-page"><PageHeader preview={false} eyebrow="Plans" title="Free, Pro or Premium — choose only what you need." description="Free keeps the complete core study loop usable. Pro adds advanced planning, exports and collaboration. Premium adds the deepest insight and backup layer. Plan access is enforced on the server, not trusted from the browser." actions={<div className="phase11-header-links"><Link href="/billing">Billing</Link><Link href="/settings">Settings</Link></div>}/><PricingClient {...model}/></div>;
}
