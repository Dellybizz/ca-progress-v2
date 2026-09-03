import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getSupabasePublicConfig } from "@/lib/env";
import { measureServerPerformance } from "@/lib/cloudflare/runtime-env";
import { createServerSupabaseClient, isCloudflareDataRuntime } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { AttemptOption, CALevel } from "@/lib/profile/validation";
import type { AppRole } from "@/lib/authorization/roles";
import { getCloudflareProfileForUser, ensureCloudflareUserBootstrap } from "./cloudflare-profile";
import { getCurrentApplicationIdentity, isCloudflareAuthRuntime } from "./provider";
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
  if (isCloudflareAuthRuntime()) {
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
  if (!getSupabasePublicConfig().configured) return { identity: null, role: "student", entitlements: [], authenticated: false };
  const identity = await measureServerPerformance("auth.identity", () => getCurrentApplicationIdentity());
  return {
    identity: identity ? {
      id: identity.id,
      email: identity.email,
      phone: identity.phone,
      displayName: identity.displayName ?? null,
      avatarUrl: identity.avatarUrl ?? null,
      role: identity.role,
      entitlements: identity.entitlements,
    } : null,
    role: identity?.role ?? "student",
    entitlements: identity?.entitlements ?? [],
    authenticated: Boolean(identity),
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
  if (isCloudflareAuthRuntime()) {
    return await measureServerPerformance("auth.profile", () => getCloudflareProfileForUser(userId) as Promise<ProfileRow | null>);
  }
  const supabase = await createServerSupabaseClient();
  const { data } = await measureServerPerformance("auth.profile", async () => await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle());
  return data ?? null;
}

// Profile reads are shared by the shell, page services, and authorization checks.
export const getProfileForUser = cache(getProfileForUserUncached);

export async function ensureUserBootstrap() {
  const identity = (await getRequestAuthContext()).identity;
  if (!identity) return null;
  if (isCloudflareAuthRuntime()) {
    await ensureCloudflareUserBootstrap({
      applicationUserId: identity.id,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
    });
  } else {
    const supabase = await createServerSupabaseClient();
    const existing = await supabase.from("profiles").select("user_id").eq("user_id", identity.id).maybeSingle();
    if (!existing.data) {
      await supabase.from("profiles").insert({
        user_id: identity.id,
        display_name: identity.displayName,
        avatar_url: identity.avatarUrl,
      });
    }
    const prefs = await supabase.from("user_preferences").select("user_id").eq("user_id", identity.id).maybeSingle();
    if (!prefs.data) await supabase.from("user_preferences").insert({ user_id: identity.id });
  }
  return {
    id: identity.id,
    email: identity.email,
    phone: identity.phone,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    role: identity.role,
    entitlements: identity.entitlements,
  } satisfies ServerIdentity;
}

export async function loadAttemptOptions(): Promise<AttemptOption[]> {
  if (!isCloudflareDataRuntime() && !getSupabasePublicConfig().configured) {
    return [{ key: "undecided", label: "Not decided yet", kind: "build_fallback" }];
  }
  const supabase = await createServerSupabaseClient();
  const [attempts, levels] = await Promise.all([
    supabase.from("exam_attempts").select("attempt_key, label, level_id").eq("verification_status", "verified"),
    supabase.from("course_levels").select("id, code").eq("is_active", true),
  ]);
  if (attempts.error || levels.error || !attempts.data?.length) return [{ key: "undecided", label: "Not decided yet", kind: "runtime_fallback" }];
  const levelById = new Map(levels.data.map((level) => [level.id, level.code as CALevel]));
  const grouped = new Map<string, { label: string; levels: Set<CALevel> }>();
  for (const row of attempts.data) {
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
