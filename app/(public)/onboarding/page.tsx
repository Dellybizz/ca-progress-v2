import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/auth/onboarding-wizard";
import { getProfileForUser, loadAttemptOptions, optionalUser } from "@/lib/auth/server";
import { loginPathFor, sanitizeReturnPath } from "@/lib/auth/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = sanitizeReturnPath(typeof params.next === "string" ? params.next : null);
  const user = await optionalUser();
  if (!user) redirect(loginPathFor(`/onboarding?next=${encodeURIComponent(next)}`));
  const [profile, attempts] = await Promise.all([getProfileForUser(user.id), loadAttemptOptions()]);
  if (!profile) redirect("/login?error=profile_bootstrap_failed");
  if (profile.onboarding_completed_at) redirect(next);
  return <OnboardingWizard initialProfile={profile} attempts={attempts} next={next}/>;
}
