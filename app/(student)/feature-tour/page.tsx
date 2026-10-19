import type { Metadata } from "next";
import { FeatureTour } from "@/components/mobile/feature-tour";
import { optionalUser } from "@/lib/auth/server";
import { getFeatureTourProgress } from "@/lib/mobile/feature-tour";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Feature Tour | CA Progress" };

export default async function FeatureTourPage() {
  let authenticated = false;
  let progress: { step: number; completedAt: string | null } = {
    step: 0,
    completedAt: null,
  };
  try {
    const user = await optionalUser();
    authenticated = Boolean(user);
    if (user) progress = await getFeatureTourProgress(user.id);
  } catch {
    // Feature Tour is non-critical and remains fully usable with local state
    // when a branch preview has no auth or D1 binding.
  }
  return (
    <FeatureTour
      authenticated={authenticated}
      initialStep={progress.step}
      completedAt={progress.completedAt}
    />
  );
}
