import type { Metadata } from "next";
import {preconnect,preload} from "react-dom";
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
    getPricingModel({includeEntitlements:false}),
    listPublishedPricingOffers(),
    listActivePlanEntitlements(),
    headers(),
    getRecurringBillingState({includeHistory:false}),
  ]);
  const commercePolicy = commercePolicyFromUserAgent(requestHeaders.get("user-agent"));
  if(model.authenticated&&commercePolicy.webCheckoutAllowed){
    for(const origin of ["https://checkout.razorpay.com","https://api.razorpay.com","https://cdn.razorpay.com"])preconnect(origin);
    preload("https://checkout.razorpay.com/v1/checkout.js",{as:"script"});
  }
  return <div className="phase11-page pricing-page">{model.authenticated&&commercePolicy.webCheckoutAllowed?<script async src="https://checkout.razorpay.com/v1/checkout.js"/>:null}<PageHeader preview={false} eyebrow="Plans" title="More focus. More progress." description="Explorer, Striver or Ranker. Compare your tools, then choose your plan." actions={<div className="phase11-header-links"><Link href="/billing">Billing</Link></div>}/><PricingClient subscription={recurring.subscription??null} hasRecurring={Boolean(recurring.subscription&&!["cancelled","completed","expired"].includes(recurring.subscription.status))} {...model} entitlements={entitlements} offers={offers} commercePolicy={commercePolicy}/></div>;
}
