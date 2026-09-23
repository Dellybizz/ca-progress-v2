import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { PricingClient } from "@/components/billing/pricing-client";
import { PageHeader } from "@/components/ui/page-header";
import { listActivePlanEntitlements, listPublishedPricingOffers } from "@/lib/billing/commercial-policy";
import { getPricingModel } from "@/lib/billing/service";
import { commercePolicyFromUserAgent } from "@/lib/mobile/commerce-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plans & Pricing | CA Progress" };

export default async function PricingPage() {
  const [model, offers, entitlements, requestHeaders] = await Promise.all([
    getPricingModel(),
    listPublishedPricingOffers(),
    listActivePlanEntitlements(),
    headers(),
  ]);
  const commercePolicy = commercePolicyFromUserAgent(requestHeaders.get("user-agent"));
  return <div className="phase11-page"><PageHeader preview={false} eyebrow="Plans" title="Free, Pro or Premium — choose only what you need." description="Prices and access are resolved by the server, not trusted from the browser. Checkout snapshots the exact commercial terms before any payment is created." actions={<div className="phase11-header-links"><Link href="/billing">Billing</Link><Link href="/settings">Settings</Link></div>}/><PricingClient {...model} entitlements={entitlements} offers={offers} commercePolicy={commercePolicy}/></div>;
}
