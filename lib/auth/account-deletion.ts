import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createAdminSupabaseClient, getSupabaseAdminRuntimeConfig } from "@/lib/supabase/admin";
import { RESOURCE_R2_BINDING } from "@/lib/resources/r2";

export type AccountDeletionStatus = {
  blocked: boolean;
  reason: "parent_owner" | "sole_owner" | null;
  role: "moderator" | "admin" | "owner" | "parent_owner" | null;
};

type R2DeleteBucket = { delete(key: string): Promise<void> };

async function readAdminRole(userId: string) {
  const db = getSupabaseAdminRuntimeConfig();
  if (!db.configured) return null;
  const response = await fetch(`${db.url}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&select=role&limit=1`, {
    headers: { apikey: db.serviceRoleKey, authorization: `Bearer ${db.serviceRoleKey}`, accept: "application/json" },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const rows = await response.json().catch(() => []) as Array<{ role?: string }>;
  const role = rows[0]?.role;
  return role === "moderator" || role === "admin" || role === "owner" || role === "parent_owner" ? role : null;
}

async function activeOwnerCount() {
  const db = getSupabaseAdminRuntimeConfig();
  if (!db.configured) return null;
  const response = await fetch(`${db.url}/rest/v1/admin_users?is_active=eq.true&role=in.(owner,parent_owner)&select=user_id`, {
    headers: { apikey: db.serviceRoleKey, authorization: `Bearer ${db.serviceRoleKey}`, accept: "application/json" },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const rows = await response.json().catch(() => []) as Array<{ user_id?: string }>;
  return rows.length;
}

export async function getAccountDeletionStatus(userId: string): Promise<AccountDeletionStatus> {
  const role = await readAdminRole(userId);
  if (role === "parent_owner") return { blocked: true, reason: "parent_owner", role };
  if (role === "owner") {
    const ownerCount = await activeOwnerCount();
    if (ownerCount !== null && ownerCount <= 1) return { blocked: true, reason: "sole_owner", role };
  }
  return { blocked: false, reason: null, role };
}

function getResourceBucketOrNull(): R2DeleteBucket | null {
  try {
    const { env } = getCloudflareContext();
    const bucket = (env as unknown as Record<string, unknown>)[RESOURCE_R2_BINDING] as R2DeleteBucket | undefined;
    return bucket && typeof bucket.delete === "function" ? bucket : null;
  } catch {
    return null;
  }
}

export async function deleteAccountData(userId: string) {
  const status = await getAccountDeletionStatus(userId);
  if (status.blocked) throw new Error(status.reason === "parent_owner" ? "PARENT_OWNER_DELETE_BLOCKED" : "SOLE_OWNER_DELETE_BLOCKED");

  const admin = createAdminSupabaseClient();
  const [profileResult, resourcesResult] = await Promise.all([
    admin.from("profiles").select("avatar_url").eq("user_id", userId).maybeSingle(),
    admin.from("uploaded_resources").select("storage_path").eq("owner_user_id", userId),
  ]);
  if (profileResult.error) throw new Error("ACCOUNT_DELETE_PROFILE_LOOKUP_FAILED");
  if (resourcesResult.error) throw new Error("ACCOUNT_DELETE_RESOURCE_LOOKUP_FAILED");

  const avatarPath = profileResult.data?.avatar_url ?? null;
  const resourcePaths = (resourcesResult.data ?? []).map((row) => row.storage_path).filter((path): path is string => typeof path === "string" && path.length > 0);
  const bucket = getResourceBucketOrNull();

  if (resourcePaths.length) {
    if (!bucket) throw new Error("ACCOUNT_DELETE_STORAGE_UNAVAILABLE");
    const cleanup = await Promise.allSettled(resourcePaths.map((path) => bucket.delete(path)));
    if (cleanup.some((result) => result.status === "rejected")) throw new Error("ACCOUNT_DELETE_STORAGE_FAILED");
  }

  if (avatarPath) {
    const avatarCleanup = await admin.storage.from("avatars").remove([avatarPath]);
    if (avatarCleanup.error) throw new Error("ACCOUNT_DELETE_AVATAR_FAILED");
  }

  const deletion = await admin.auth.admin.deleteUser(userId);
  if (deletion.error) throw new Error("ACCOUNT_DELETE_AUTH_FAILED");
}
