import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type ProfilePatch = {
  displayName?: string | null;
  avatarUrl?: string | null;
  caLevel?: "foundation" | "intermediate" | "final" | null;
  groupChoice?: "group_1" | "group_2" | "both" | "not_applicable" | null;
  attemptKey?: string | null;
  dailyTargetMinutes?: number | null;
  onboardingStep?: number;
  onboardingCompletedAt?: string | null;
  timezone?: string;
};

export class AvatarPersistenceError extends Error {
  constructor(readonly stage: "upload" | "attach") {
    super(stage === "upload" ? "avatar_upload_failed" : "avatar_attach_failed");
    this.name = "AvatarPersistenceError";
  }
}

function toDatabasePatch(patch: ProfilePatch): ProfileUpdate {
  const update: ProfileUpdate = {};
  if ("displayName" in patch) update.display_name = patch.displayName ?? null;
  if ("avatarUrl" in patch) update.avatar_url = patch.avatarUrl ?? null;
  if ("caLevel" in patch) update.ca_level = patch.caLevel ?? null;
  if ("groupChoice" in patch) update.group_choice = patch.groupChoice ?? null;
  if ("attemptKey" in patch) update.attempt_key = patch.attemptKey ?? null;
  if ("dailyTargetMinutes" in patch) update.daily_target_minutes = patch.dailyTargetMinutes ?? null;
  if ("onboardingStep" in patch) update.onboarding_step = patch.onboardingStep;
  if ("onboardingCompletedAt" in patch) update.onboarding_completed_at = patch.onboardingCompletedAt ?? null;
  if ("timezone" in patch) update.timezone = patch.timezone;
  return update;
}

export async function saveProfilePatch(userId: string, patch: ProfilePatch) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("profiles").update(toDatabasePatch(patch)).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return data;
}

export async function replaceUserAvatar(input: {
  userId: string;
  previousPath: string | null;
  payload: Uint8Array;
  contentType: string;
  extension: string;
}) {
  const client = await createServerSupabaseClient();
  const path = `${input.userId}/avatar-${Date.now()}.${input.extension}`;
  const uploaded = await client.storage.from("avatars").upload(path, input.payload, {
    contentType: input.contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (uploaded.error) throw new AvatarPersistenceError("upload");

  const updated = await client.from("profiles").update({ avatar_url: path }).eq("user_id", input.userId);
  if (updated.error) {
    await client.storage.from("avatars").remove([path]);
    throw new AvatarPersistenceError("attach");
  }

  if (input.previousPath?.startsWith(`${input.userId}/`) && input.previousPath !== path) {
    await client.storage.from("avatars").remove([input.previousPath]);
  }

  const signed = await client.storage.from("avatars").createSignedUrl(path, 60 * 60);
  return { path, signedUrl: signed.data?.signedUrl ?? null };
}
