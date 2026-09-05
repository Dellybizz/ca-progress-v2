import { redirect } from "next/navigation";
import { LoginRequired } from "@/components/auth/login-required";
import { ProfileForm } from "@/components/auth/profile-form";
import { getProfileForUser, loadAttemptOptions, optionalUser } from "@/lib/auth/server";
import { getProfileAvatarAccessUrl } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const user = await optionalUser();
  if (!user) return <LoginRequired next="/settings/profile"/>;
  const [profile, attempts] = await Promise.all([getProfileForUser(user.id), loadAttemptOptions()]);
  if (!profile) redirect("/onboarding?next=/settings/profile");
  if (!profile.onboarding_completed_at) redirect("/onboarding?next=/settings/profile");
  const avatarAccessUrl = await getProfileAvatarAccessUrl(user.id, profile.avatar_url);
  return <ProfileForm profile={profile} attempts={attempts} avatarSignedUrl={avatarAccessUrl} identityLabel={user.email || user.phone || "Authenticated student"}/>;
}
