import type { Metadata } from "next";
import Link from "next/link";
import { PricingClient } from "@/components/billing/pricing-client";
import { PageHeader } from "@/components/ui/page-header";
import { listActivePlanEntitlements, listPublishedPricingOffers } from "@/lib/billing/commercial-policy";
import { getPricingModel } from "@/lib/billing/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plans & Pricing | CA Progress" };

export default async function PricingPage() {
  const [model, offers, entitlements] = await Promise.all([
    getPricingModel(),
    listPublishedPricingOffers(),
    listActivePlanEntitlements(),
  ]);
  return <div className="phase11-page"><PageHeader preview={false} eyebrow="Plans" title="Free, Pro or Premium — choose only what you need." description="Prices and access come from the published server policy. Checkout snapshots the exact commercial terms before any payment is created." actions={<div className="phase11-header-links"><Link href="/billing">Billing</Link><Link href="/settings">Settings</Link></div>}/><PricingClient {...model} entitlements={entitlements} offers={offers}/></div>;
}
