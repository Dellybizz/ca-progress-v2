import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isCloudflareAuthRuntime } from "@/lib/auth/provider";
import { setCloudflareProfileAvatar } from "@/lib/auth/cloudflare-profile";
import { deleteOwnedAvatarObject, isOwnedAvatarObjectKey, putAvatarObject } from "@/lib/resources/r2";

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
  // General profile persistence remains on the active database provider until the
  // Phase 4 data cutover. Phase 3 only removes Supabase Storage from new writes.
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("profiles").update(toDatabasePatch(patch)).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return data;
}

/**
 * Provider-neutral avatar access. New Phase 3 objects are private R2 keys and are
 * served through an authenticated application route. While Supabase is still the
 * production source, legacy avatar objects keep their temporary signed-read path;
 * the Cloudflare target runtime never requires that fallback.
 */
export async function getProfileAvatarAccessUrl(userId: string, path: string | null | undefined) {
  if (!path) return null;
  if (isOwnedAvatarObjectKey(userId, path)) return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
  if (isCloudflareAuthRuntime()) return null;
  const client = await createServerSupabaseClient();
  const signed = await client.storage.from("avatars").createSignedUrl(path, 60 * 60);
  return signed.data?.signedUrl ?? null;
}

export async function replaceUserAvatar(input: {
  userId: string;
  previousPath: string | null;
  payload: Uint8Array;
  contentType: string;
  extension: string;
}) {
  let path: string;
  try {
    path = await putAvatarObject({
      applicationUserId: input.userId,
      payload: input.payload,
      contentType: input.contentType,
      extension: input.extension,
    });
  } catch {
    throw new AvatarPersistenceError("upload");
  }

  try {
    if (isCloudflareAuthRuntime()) {
      await setCloudflareProfileAvatar(input.userId, path);
    } else {
      const client = await createServerSupabaseClient();
      const updated = await client.from("profiles").update({ avatar_url: path }).eq("user_id", input.userId);
      if (updated.error) throw updated.error;
    }
  } catch {
    await deleteOwnedAvatarObject(input.userId, path).catch(() => undefined);
    throw new AvatarPersistenceError("attach");
  }

  if (input.previousPath && input.previousPath !== path) {
    // Only R2-owned keys are deleted here. Legacy Supabase Storage objects are left
    // untouched until the Phase 4 production storage migration/reconciliation.
    await deleteOwnedAvatarObject(input.userId, input.previousPath).catch(() => undefined);
  }

  return { path, signedUrl: `/api/profile/avatar?path=${encodeURIComponent(path)}` };
}
