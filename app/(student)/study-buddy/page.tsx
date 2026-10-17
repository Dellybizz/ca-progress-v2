import { LoginRequired } from "@/components/auth/login-required";
import { StudyBuddyWorkspace } from "@/components/study-buddy/study-buddy-workspace";
import type { StudyBuddyDashboard } from "@/components/study-buddy/study-buddy-workspace";
import { optionalUser } from "@/lib/auth/server";
import { getStudyBuddyComparison, getStudyBuddyOwnerSummary } from "@/lib/study-buddy/comparison";
import { getStudyBuddyDashboard } from "@/lib/study-buddy/service";

import {sampleBuddyDashboard,sampleBuddyComparison,sampleOwnerSummary} from "@/components/study-buddy/layout-sample";

export const dynamic = "force-dynamic";

export default async function StudyBuddyPage({searchParams}:{searchParams:Promise<{preview?:string}>}) {
  const user = await optionalUser();
  if (!user) return <LoginRequired next="/study-buddy"/>;
  if((await searchParams).preview==='layout')return <StudyBuddyWorkspace ownerUserId="preview-owner" initialDashboard={sampleBuddyDashboard} initialComparison={sampleBuddyComparison} initialOwnerSummary={sampleOwnerSummary} preview/>;
  const [dashboard, comparison, ownerSummary] = await Promise.all([
    getStudyBuddyDashboard(user.id),
    getStudyBuddyComparison(user.id),
    getStudyBuddyOwnerSummary(user.id),
  ]);
  return <StudyBuddyWorkspace ownerUserId={user.id} initialDashboard={dashboard as StudyBuddyDashboard} initialComparison={comparison} initialOwnerSummary={ownerSummary}/>;
}
