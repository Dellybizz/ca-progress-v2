import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { measureServerPerformance } from "@/lib/cloudflare/runtime-env";
import { createD1ServerClient } from "@/lib/data/d1/client";
import type { Database } from "@/lib/data/database.types";
import type { AttemptOption, CALevel } from "@/lib/profile/validation";
import type { AppRole } from "@/lib/authorization/roles";
import { getCloudflareProfileForUser, ensureCloudflareUserBootstrap } from "./cloudflare-profile";
import { getCloudflareRequestAuth } from "./cloudflare";
import { loginPathFor, sanitizeReturnPath } from "./navigation";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ServerIdentity = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: AppRole | null;
  entitlements?: string[];
};
export type Viewer = { authenticated: boolean; id?: string; label: string; initial: string };

export type RequestAuthContext = {
  identity: ServerIdentity | null;
  role: AppRole;
  entitlements: string[];
  authenticated: boolean;
};

async function getRequestAuthContextUncached(): Promise<RequestAuthContext> {
  const auth = await getCloudflareRequestAuth();
  const session = auth.session;
  return {
    identity: session ? {
      id: auth.applicationUserId!,
      email: session.email,
      phone: session.phone,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      role: auth.role,
      entitlements: auth.entitlements,
    } : null,
    role: auth.role,
    entitlements: auth.entitlements,
    authenticated: auth.authenticated,
  };
}

export const getRequestAuthContext = cache(getRequestAuthContextUncached);

async function optionalUserUncached(): Promise<ServerIdentity | null> {
  return (await getRequestAuthContext()).identity;
}

// Share the authenticated identity across the shell and page loaders during one request.
export const optionalUser = cache(optionalUserUncached);

export async function requireUser(next = "/dashboard") {
  const user = await optionalUser();
  if (!user) redirect(loginPathFor(next));
  return user;
}

async function getProfileForUserUncached(userId: string): Promise<ProfileRow | null> {
  return await measureServerPerformance("auth.profile", () => getCloudflareProfileForUser(userId) as Promise<ProfileRow | null>);
}

// Profile reads are shared by the shell, page services, and authorization checks.
export const getProfileForUser = cache(getProfileForUserUncached);

export async function ensureUserBootstrap() {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) return null;
  await ensureCloudflareUserBootstrap({
    applicationUserId: identity.id,
    displayName: identity.displayName ?? null,
    avatarUrl: identity.avatarUrl ?? null,
  });
  return {
    id: identity.id,
    email: identity.email,
    phone: identity.phone,
    displayName: identity.displayName ?? null,
    avatarUrl: identity.avatarUrl ?? null,
    role: identity.role,
    entitlements: identity.entitlements,
  } satisfies ServerIdentity;
}

export async function loadAttemptOptions(): Promise<AttemptOption[]> {
  const client = await createD1ServerClient();
  const [attempts, levels] = await Promise.all([
    client.from("exam_attempts").select("attempt_key, label, level_id").eq("verification_status", "verified"),
    client.from("course_levels").select("id, code").eq("is_active", true),
  ]);
  const attemptRows = (attempts.data ?? []) as Array<{ attempt_key: string; label: string; level_id: string }>;
  const levelRows = (levels.data ?? []) as Array<{ id: string; code: CALevel }>;
  if (attempts.error || levels.error || !attemptRows.length) return [{ key: "undecided", label: "Not decided yet", kind: "runtime_fallback" }];
  const levelById = new Map<string, CALevel>(levelRows.map((level) => [level.id, level.code]));
  const grouped = new Map<string, { label: string; levels: Set<CALevel> }>();
  for (const row of attemptRows) {
    const level = levelById.get(row.level_id);
    if (!level) continue;
    const current = grouped.get(row.attempt_key) ?? { label: row.label, levels: new Set<CALevel>() };
    current.levels.add(level);
    if (row.label) current.label = row.label;
    grouped.set(row.attempt_key, current);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, value]) => ({ key, label: value.label, kind: "verified_exam_attempt", levels: [...value.levels] }));
}

export async function resolvePostAuthDestination(next: string) {
  const user = await optionalUser();
  const safeNext = sanitizeReturnPath(next);
  if (!user) return loginPathFor(safeNext);
  const profile = await getProfileForUser(user.id);
  if (!profile?.onboarding_completed_at) return `/onboarding?next=${encodeURIComponent(safeNext)}`;
  return safeNext;
}

export async function loadViewer(): Promise<Viewer> {
  const user = await optionalUser();
  if (!user) return { authenticated: false, label: "Guest", initial: "G" };
  const profile = await getProfileForUser(user.id);
  const label = profile?.display_name || user.displayName || user.email || user.phone || "Student";
  return { authenticated: true, id: user.id, label, initial: label.trim().charAt(0).toUpperCase() || "S" };
}
