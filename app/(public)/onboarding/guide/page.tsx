import { redirect } from "next/navigation";
import { FeatureGuide } from "@/components/auth/feature-guide";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { loginPathFor, sanitizeReturnPath } from "@/lib/auth/navigation";
import { isPrimaryUse } from "@/lib/profile/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingGuidePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = sanitizeReturnPath(typeof params.next === "string" ? params.next : null);
  const user = await optionalUser();
  if (!user) redirect(loginPathFor(`/onboarding/guide?next=${encodeURIComponent(next)}`));
  const profile = await getProfileForUser(user.id);
  if (!profile?.onboarding_completed_at) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  if (profile.feature_guide_completed_at) redirect(next);
  const primaryUse = isPrimaryUse(profile.primary_use) ? profile.primary_use : "plan";
  return <FeatureGuide primaryUse={primaryUse} next={next}/>;
}
