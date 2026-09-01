import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<{ success?: boolean; results?: T[] }>;
};
type D1Database = { prepare(query: string): D1Statement };

export type CloudflareProfileRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  ca_level: string | null;
  group_choice: string | null;
  attempt_key: string | null;
  timezone: string;
  daily_target_minutes: number | null;
  onboarding_step: number;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CloudflareProfilePatch = {
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

function db(): D1Database {
  const { env } = getCloudflareContext();
  const value = (env as unknown as Record<string, unknown>).DB as D1Database | undefined;
  if (!value || typeof value.prepare !== "function") throw new Error("Cloudflare D1 DB binding is required.");
  return value;
}

export async function getCloudflareProfileForUser(applicationUserId: string) {
  return db().prepare("SELECT * FROM profiles WHERE user_id=?1 LIMIT 1").bind(applicationUserId).first<CloudflareProfileRow>();
}

export async function ensureCloudflareUserBootstrap(input: {
  applicationUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const database = db();
  await database.prepare(
    "INSERT OR IGNORE INTO profiles(user_id,display_name,avatar_url) VALUES(?1,?2,?3)",
  ).bind(input.applicationUserId, input.displayName, input.avatarUrl).run();
  await database.prepare(
    "INSERT OR IGNORE INTO user_preferences(user_id) VALUES(?1)",
  ).bind(input.applicationUserId).run();
}

export async function saveCloudflareProfilePatch(applicationUserId: string, patch: CloudflareProfilePatch) {
  const columns: Array<[keyof CloudflareProfilePatch, string]> = [
    ["displayName", "display_name"],
    ["avatarUrl", "avatar_url"],
    ["caLevel", "ca_level"],
    ["groupChoice", "group_choice"],
    ["attemptKey", "attempt_key"],
    ["dailyTargetMinutes", "daily_target_minutes"],
    ["onboardingStep", "onboarding_step"],
    ["onboardingCompletedAt", "onboarding_completed_at"],
    ["timezone", "timezone"],
  ];
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of columns) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    values.push(patch[key] ?? null);
    assignments.push(`${column}=?${values.length}`);
  }
  if (!assignments.length) return getCloudflareProfileForUser(applicationUserId);
  assignments.push("updated_at=CURRENT_TIMESTAMP");
  values.push(applicationUserId);
  return db().prepare(
    `UPDATE profiles SET ${assignments.join(",")} WHERE user_id=?${values.length} RETURNING *`,
  ).bind(...values).first<CloudflareProfileRow>();
}

export async function setCloudflareProfileAvatar(applicationUserId: string, objectKey: string) {
  const result = await db().prepare(
    "UPDATE profiles SET avatar_url=?1,updated_at=CURRENT_TIMESTAMP WHERE user_id=?2",
  ).bind(objectKey, applicationUserId).run();
  if (result.success === false) throw new Error("D1 profile avatar update failed.");
}
