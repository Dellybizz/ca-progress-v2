import type { Metadata } from "next";
import Link from "next/link";
import { AccountDeletionControls } from "@/components/auth/account-deletion-controls";
import { optionalUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delete account | CA Progress", robots: { index: true, follow: true } };
export default async function AccountDeletionPage() {
  const user = await optionalUser();
  return <main className="page-shell"><section className="ui-card" style={{ maxWidth: 680, margin: "40px auto", padding: 24 }}><p className="eyebrow">Account controls</p><h1>Delete your CA Progress account</h1><p>Request deletion inside the app or from this public web page. Existing subscriptions should be cancelled before deletion. Payment, tax, fraud-prevention and immutable audit evidence may be retained where legally required; it will no longer be used as active study-profile data.</p>{!user ? <p><Link className="ui-button ui-button--primary" href="/login?next=%2Faccount-deletion">Sign in to continue</Link></p> : null}<AccountDeletionControls authenticated={Boolean(user)}/><p><Link href="/privacy">Read the privacy policy</Link></p></section></main>;
}
