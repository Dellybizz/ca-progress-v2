import type { Metadata } from "next";
import { FeatureTour } from "@/components/mobile/feature-tour";
import { optionalUser } from "@/lib/auth/server";
import { getFeatureTourProgress } from "@/lib/mobile/feature-tour";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Feature Tour | CA Progress" };

export default async function FeatureTourPage() {
  const user = await optionalUser();
  const progress = user
    ? await getFeatureTourProgress(user.id)
    : { step: 0, completedAt: null };
  return (
    <FeatureTour
      authenticated={Boolean(user)}
      initialStep={progress.step}
      completedAt={progress.completedAt}
    />
  );
}
