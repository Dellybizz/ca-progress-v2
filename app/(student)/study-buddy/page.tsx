import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import { getStudyBuddyDashboard } from "@/lib/study-buddy/service";
import { StudyBuddyPage } from "@/components/study-buddy/study-buddy-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Study Buddy | CA Progress" };

export default async function Page() {
  const user = await requireUser("/study-buddy");
  return <StudyBuddyPage userId={user.id} initialDashboard={await getStudyBuddyDashboard(user.id)}/>;
}
