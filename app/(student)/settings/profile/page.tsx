import Link from "next/link";
import { ProfileOverview } from "@/components/profile/profile-overview";
import { getOwnerProfileOverview } from "@/lib/profile/overview";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { LoginRequired } from "@/components/auth/login-required";
import { ProfileForm } from "@/components/auth/profile-form";
import { StudyProfilePrivacy } from "@/components/auth/study-profile-privacy";
import { getProfileForUser, loadAttemptOptions, optionalUser } from "@/lib/auth/server";
import { getProfileAvatarAccessUrl } from "@/lib/profile/service";
import { getOwnerStudyProfileSettings } from "@/lib/profile/study-profile";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage({ searchParams }: { searchParams: Promise<{edit?:string;privacy?:string}> }) {
  const user = await optionalUser();
  if (!user) return <LoginRequired next="/settings/profile"/>;
  const [profile, attempts, studyProfileSettings] = await Promise.all([
    getProfileForUser(user.id),
    loadAttemptOptions(),
    getOwnerStudyProfileSettings(user.id),
  ]);
  if (!profile) redirect("/onboarding?next=/settings/profile");
  if (!profile.onboarding_completed_at) redirect("/onboarding?next=/settings/profile");
  const avatarAccessUrl = await getProfileAvatarAccessUrl(user.id, profile.avatar_url);
  const query = await searchParams;
  const editing = query.edit === "1";
  if (!editing) {
    const stats = await getOwnerProfileOverview(user.id, profile);
    const level = ({foundation:"Foundation",intermediate:"Intermediate",final:"Final"} as Record<string,string>)[profile.ca_level || ""] || "Not selected";
    const group = ({both:"Both groups",group_1:"Group 1",group_2:"Group 2",not_applicable:"All papers"} as Record<string,string>)[profile.group_choice || ""] || "Not selected";
    return <ProfileOverview userId={user.id} name={profile.display_name || "Student"} avatar={avatarAccessUrl} bio={studyProfileSettings.publicBio} level={level} group={group} attempt={attempts.find(item=>item.key===profile.attempt_key)?.label || profile.attempt_key || "Not selected"} dailyMinutes={profile.daily_target_minutes ?? 120} visibility={studyProfileSettings.profileVisibility} buddyCount={studyProfileSettings.buddyUserIds.length} stats={stats}/>;
  }
  return <div className="profile-v3-page">
    <Link href="/settings/profile" className="student-profile-back">← Back to profile</Link>
    <ProfileForm profile={profile} attempts={attempts} avatarSignedUrl={avatarAccessUrl} identityLabel={user.email || user.phone || "Authenticated student"}/>
    <div id="privacy"><StudyProfilePrivacy ownerUserId={user.id} initialSettings={studyProfileSettings} expanded={query.privacy === "1"}/></div>
    <form action="/auth/signout" method="post" className="profile-v3-signout"><Button type="submit" variant="ghost">Sign out</Button></form>
  </div>;
}
