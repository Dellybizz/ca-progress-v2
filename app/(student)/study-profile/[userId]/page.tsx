import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { optionalUser } from "@/lib/auth/server";
import { getStudyProfileForViewer, StudyProfileInputError } from "@/lib/profile/study-profile";

export const dynamic = "force-dynamic";

type VisibleStudyProfile = {
  userId: string;
  displayName: string;
  publicBio: string | null;
  relationship: "owner" | "buddy" | "public";
  caLevel?: string;
  attemptKey?: string;
  progress?: { firstCoveragePercent: number; revisionReadinessPercent: number; testingReadinessPercent: number };
  streak?: { currentStreakDays: number; activeDaysLast14: number };
};

function unavailable() {
  return <main className="page-shell"><Card><CardHeader title="Study profile unavailable" description="This profile does not exist or its privacy settings do not allow this view."/><CardBody><Link href="/dashboard">Back to dashboard</Link></CardBody></Card></main>;
}

export default async function StudyProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const viewer = await optionalUser();
  const { userId } = await params;
  let profile: VisibleStudyProfile | null = null;
  try {
    profile = await getStudyProfileForViewer(userId, viewer?.id ?? null) as VisibleStudyProfile | null;
  } catch (error) {
    if (!(error instanceof StudyProfileInputError)) throw error;
  }
  if (!profile) return unavailable();

  return <main className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">Study Profile</p><h1>{profile.displayName}</h1><p>{profile.publicBio || "No public bio added."}</p></div></div>
    <div className="profile-v2__grid">
      {(profile.caLevel || profile.attemptKey) ? <Card><CardHeader title="Study setup" description="Only fields this student chose to share are shown."/><CardBody><div className="profile-form-stack">{profile.caLevel ? <p><strong>CA level:</strong> {profile.caLevel}</p> : null}{profile.attemptKey ? <p><strong>Target attempt:</strong> {profile.attemptKey}</p> : null}</div></CardBody></Card> : null}
      {profile.progress ? <Card><CardHeader title="Progress" description="Selected aggregate milestones only."/><CardBody><div className="profile-form-stack"><p><strong>First Coverage:</strong> {profile.progress.firstCoveragePercent}%</p><p><strong>Revision Readiness:</strong> {profile.progress.revisionReadinessPercent}%</p><p><strong>Testing Readiness:</strong> {profile.progress.testingReadinessPercent}%</p></div></CardBody></Card> : null}
      {profile.streak ? <Card><CardHeader title="Consistency" description="Study-session aggregates only."/><CardBody><div className="profile-form-stack"><p><strong>Current streak:</strong> {profile.streak.currentStreakDays} day{profile.streak.currentStreakDays === 1 ? "" : "s"}</p><p><strong>Active days in the last 14:</strong> {profile.streak.activeDaysLast14}</p></div></CardBody></Card> : null}
    </div>
    {profile.relationship === "owner" ? <p style={{ marginTop: 18 }}><Link href="/settings/profile">Manage Study Profile privacy</Link></p> : null}
  </main>;
}
