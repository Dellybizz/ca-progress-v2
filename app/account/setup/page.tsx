import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSetupForm } from "@/components/auth/account-setup-form";
import { getAccountSetupState } from "@/lib/auth/account-setup";
import { getCloudflareApplicationSession } from "@/lib/auth/cloudflare";
import { loginPathFor, sanitizeReturnPath } from "@/lib/auth/navigation";

export const dynamic = "force-dynamic";

export default async function AccountSetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = sanitizeReturnPath((await searchParams).next || "/dashboard");
  const session = await getCloudflareApplicationSession();
  if (!session) redirect(loginPathFor("/account/setup"));
  const state = await getAccountSetupState();
  if (!state?.eligible || !state.username) return <div className="settings-v2-page"><h1>Account login</h1><p>Your initial setup is unavailable or already complete.</p><Link href="/settings">Open Settings</Link></div>;
  return <AccountSetupForm assignedUsername={state.username} profileName={session.displayName} next={next === "/account/setup" ? "/dashboard" : next}/>;
}
