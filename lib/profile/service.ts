import "server-only";

import { saveCloudflareProfilePatch } from "@/lib/auth/cloudflare-profile";
import { setCloudflareProfileAvatar } from "@/lib/auth/cloudflare-profile";
import { deleteOwnedAvatarObject, isOwnedAvatarObjectKey, putAvatarObject } from "@/lib/resources/r2";

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

export async function saveProfilePatch(userId: string, patch: ProfilePatch) {
  const data = await saveCloudflareProfilePatch(userId, patch);
  if (!data) throw new Error("Cloudflare profile update returned no row.");
  return data;
}

/** R2-owned avatars are served only through the authenticated application route. */
export async function getProfileAvatarAccessUrl(userId: string, path: string | null | undefined) {
  if (!path || !isOwnedAvatarObjectKey(userId, path)) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
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
    await setCloudflareProfileAvatar(input.userId, path);
  } catch {
    await deleteOwnedAvatarObject(input.userId, path).catch(() => undefined);
    throw new AvatarPersistenceError("attach");
  }

  if (input.previousPath && input.previousPath !== path) {
    await deleteOwnedAvatarObject(input.userId, input.previousPath).catch(() => undefined);
  }

  return { path, signedUrl: `/api/profile/avatar?path=${encodeURIComponent(path)}` };
}
