import { redirect } from "next/navigation";
import {SetupEntry as OnboardingWizard} from "@/components/auth/onboarding/setup-entry";
import {getSetupState} from "@/lib/profile/setup-state";
import {resumeLegacySetup,reconcileSavedSetup} from "@/lib/profile/setup-contract";
import { getProfileForUser, loadAttemptOptions, optionalUser } from "@/lib/auth/server";
import { loginPathFor, sanitizeReturnPath } from "@/lib/auth/navigation";
import { getOnboardingPreparationState } from "@/lib/profile/onboarding-experience";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = sanitizeReturnPath(typeof params.next === "string" ? params.next : null, "/planner/today");
  const user = await optionalUser();
  if (!user) redirect(loginPathFor(`/onboarding?next=${encodeURIComponent(next)}`));
  const profile=await getProfileForUser(user.id);
  if (!profile) redirect("/login?error=profile_bootstrap_failed");
  if (profile.onboarding_completed_at) redirect(next);
  const [attempts,preparationState,saved]=await Promise.all([loadAttemptOptions(),getOnboardingPreparationState(user.id),getSetupState(user.id)]);
  return <OnboardingWizard key={user.id} initial={saved?{...saved,draft:reconcileSavedSetup(saved.draft,attempts)}:{draft:resumeLegacySetup({...profile,preparation_state:preparationState},attempts),revision:0}} existingGoal={profile.daily_target_minutes} accountId={user.id} attempts={attempts} next={next}/>;
}
