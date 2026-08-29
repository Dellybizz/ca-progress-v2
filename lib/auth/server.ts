import "server-only";

import { redirect } from "next/navigation";
import { getSupabasePublicConfig } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { AttemptOption } from "@/lib/profile/validation";
import { loginPathFor, sanitizeReturnPath } from "./navigation";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ServerIdentity = { id: string; email: string | null; phone: string | null };
export type Viewer = { authenticated: boolean; id?: string; label: string; initial: string };

function claimString(claims: Record<string, unknown>, key: string) {
  return typeof claims[key] === "string" ? claims[key] as string : null;
}

export async function optionalUser(): Promise<ServerIdentity | null> {
  if (!getSupabasePublicConfig().configured) return null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  if (error || !claims) return null;
  const id = claimString(claims, "sub");
  if (!id) return null;
  return { id, email: claimString(claims, "email"), phone: claimString(claims, "phone") };
}

export async function requireUser(next = "/dashboard") {
  const user = await optionalUser();
  if (!user) redirect(loginPathFor(next));
  return user;
}

export async function getProfileForUser(userId: string): Promise<ProfileRow | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  return data ?? null;
}

export async function ensureUserBootstrap() {
  const supabase = await createServerSupabaseClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) return null;
  const user = userData.user;
  const existing = await supabase.from("profiles").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!existing.data) {
    const metadata = user.user_metadata ?? {};
    const displayName = typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : null;
    const avatarUrl = typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;
    await supabase.from("profiles").insert({ user_id: user.id, display_name: displayName, avatar_url: avatarUrl });
  }
  const prefs = await supabase.from("user_preferences").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!prefs.data) await supabase.from("user_preferences").insert({ user_id: user.id });
  return { id: user.id, email: user.email ?? null, phone: user.phone ?? null } satisfies ServerIdentity;
}

function parseAttemptOptions(value: Json): AttemptOption[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const options = (value as Record<string, Json | undefined>).options;
  if (!Array.isArray(options)) return [];
  return options.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, Json | undefined>;
    if (typeof record.key !== "string" || typeof record.label !== "string") return [];
    return [{ key: record.key, label: record.label, kind: typeof record.kind === "string" ? record.kind : undefined }];
  });
}

export async function loadAttemptOptions(): Promise<AttemptOption[]> {
  if (!getSupabasePublicConfig().configured) return [{ key: "undecided", label: "Not decided yet", kind: "build_fallback" }];
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "onboarding.attempt_options").maybeSingle();
  const options = data ? parseAttemptOptions(data.value) : [];
  return options.length ? options : [{ key: "undecided", label: "Not decided yet", kind: "runtime_fallback" }];
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
  const label = profile?.display_name || user.email || user.phone || "Student";
  return { authenticated: true, id: user.id, label, initial: label.trim().charAt(0).toUpperCase() || "S" };
}
