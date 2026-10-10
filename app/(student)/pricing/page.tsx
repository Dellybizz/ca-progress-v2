import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { PricingClient } from "@/components/billing/pricing-client";
import { PageHeader } from "@/components/ui/page-header";
import { listActivePlanEntitlements, listPublishedPricingOffers } from "@/lib/billing/commercial-policy";
import { getRecurringBillingState } from "@/lib/billing/recurring-service";
import { getPricingModel } from "@/lib/billing/service";
import { commercePolicyFromUserAgent } from "@/lib/mobile/commerce-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plans & Pricing | CA Progress" };

export default async function PricingPage() {
  const [model, offers, entitlements, requestHeaders, recurring] = await Promise.all([
    getPricingModel(),
    listPublishedPricingOffers(),
    listActivePlanEntitlements(),
    headers(),
    getRecurringBillingState(),
  ]);
  const commercePolicy = commercePolicyFromUserAgent(requestHeaders.get("user-agent"));
  return <div className="phase11-page"><PageHeader preview={false} eyebrow="Plans" title="Free, Basic or Pro — choose only what you need." description="Start free. Upgrade for better planning or deeper insights, with clear prices and automatic plan activation." actions={<div className="phase11-header-links"><Link href="/billing">Billing</Link><Link href="/settings">Settings</Link></div>}/><PricingClient hasRecurring={Boolean(recurring.subscription&&!["cancelled","completed","expired"].includes(recurring.subscription.status))} {...model} entitlements={entitlements} offers={offers} commercePolicy={commercePolicy}/></div>;
}
