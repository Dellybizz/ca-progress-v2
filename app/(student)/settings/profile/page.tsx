import { redirect } from "next/navigation";
import { LoginRequired } from "@/components/auth/login-required";
import { ProfileForm } from "@/components/auth/profile-form";
import { getProfileForUser, loadAttemptOptions, optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const user = await optionalUser();
  if (!user) return <LoginRequired next="/settings/profile"/>;
  const [profile, attempts] = await Promise.all([getProfileForUser(user.id), loadAttemptOptions()]);
  if (!profile) redirect("/onboarding?next=/settings/profile");
  if (!profile.onboarding_completed_at) redirect("/onboarding?next=/settings/profile");
  let signedUrl: string | null = null;
  if (profile.avatar_url) {
    const supabase = await createServerSupabaseClient();
    const result = await supabase.storage.from("avatars").createSignedUrl(profile.avatar_url, 60 * 60);
    signedUrl = result.data?.signedUrl ?? null;
  }
  return <ProfileForm profile={profile} attempts={attempts} avatarSignedUrl={signedUrl} identityLabel={user.email || user.phone || "Authenticated student"}/>;
}
