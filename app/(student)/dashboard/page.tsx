import { FeatureGuide } from "@/components/auth/feature-guide";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { getProfileForUser, optionalUser } from "@/lib/auth/server";
import { sanitizeReturnPath } from "@/lib/auth/navigation";
import { getDashboardPageModel } from "@/lib/dashboard/service";
import { normalizePrimaryUsePriority } from "@/lib/profile/onboarding";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = sanitizeReturnPath(typeof params.next === "string" ? params.next : "/dashboard");
  const [model, user] = await Promise.all([getDashboardPageModel(), optionalUser()]);
  const profile = user ? await getProfileForUser(user.id) : null;
  const showGuide = model.mode === "ready" && Boolean(profile?.onboarding_completed_at) && !profile?.feature_guide_completed_at;
  const priorities = normalizePrimaryUsePriority(profile?.primary_use_priority, profile?.primary_use);

  return <>
    <StudentDashboard model={model} />
    {showGuide ? <FeatureGuide priorities={priorities.length ? priorities : ["plan"]} next={next}/> : null}
  </>;
}
