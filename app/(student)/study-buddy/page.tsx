import { LoginRequired } from "@/components/auth/login-required";
import { StudyBuddyWorkspace } from "@/components/study-buddy/study-buddy-workspace";
import type { StudyBuddyDashboard } from "@/components/study-buddy/study-buddy-workspace";
import { optionalUser } from "@/lib/auth/server";
import { getStudyBuddyDashboard } from "@/lib/study-buddy/service";

export const dynamic = "force-dynamic";

export default async function StudyBuddyPage() {
  const user = await optionalUser();
  if (!user) return <LoginRequired next="/study-buddy"/>;
  const dashboard = await getStudyBuddyDashboard(user.id);
  return <StudyBuddyWorkspace ownerUserId={user.id} initialDashboard={dashboard as StudyBuddyDashboard}/>;
}
