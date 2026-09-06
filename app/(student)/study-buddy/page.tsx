import { LoginRequired } from "@/components/auth/login-required";
import { StudyBuddyComparison } from "@/components/study-buddy/study-buddy-comparison";
import { StudyBuddyWorkspace } from "@/components/study-buddy/study-buddy-workspace";
import type { StudyBuddyDashboard } from "@/components/study-buddy/study-buddy-workspace";
import { optionalUser } from "@/lib/auth/server";
import { getStudyBuddyComparison } from "@/lib/study-buddy/comparison";
import { getStudyBuddyDashboard } from "@/lib/study-buddy/service";

export const dynamic = "force-dynamic";

export default async function StudyBuddyPage() {
  const user = await optionalUser();
  if (!user) return <LoginRequired next="/study-buddy"/>;
  const [dashboard, comparison] = await Promise.all([
    getStudyBuddyDashboard(user.id),
    getStudyBuddyComparison(user.id),
  ]);
  return <>
    <StudyBuddyComparison items={comparison}/>
    <StudyBuddyWorkspace ownerUserId={user.id} initialDashboard={dashboard as StudyBuddyDashboard}/>
  </>;
}
