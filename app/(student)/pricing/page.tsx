import type { Metadata } from "next";
import Link from "next/link";
import { PricingClient } from "@/components/billing/pricing-client";
import { PageHeader } from "@/components/ui/page-header";
import { getPricingModel } from "@/lib/billing/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plans & Pricing | CA Progress" };

export default async function PricingPage() {
  const model = await getPricingModel();
  return <div className="phase11-page"><PageHeader preview={false} eyebrow="Plans" title="Choose a plan without giving the browser billing authority." description="Free, Basic and Pro use server-defined durations, prices and entitlements. Existing V2 study features remain available while Phase 11 adds storage allowances and a secure paid-plan foundation." actions={<div className="phase11-header-links"><Link href="/billing">Billing</Link><Link href="/settings">Settings</Link></div>}/><PricingClient {...model}/></div>;
}
