import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SupportedOAuthProvider = "google" | "linkedin_oidc";

/**
 * Provider-neutral auth boundary for route handlers. Phase 1 intentionally keeps
 * Supabase Auth as the implementation; a later migration phase may replace the
 * implementation without making OAuth routes provider-aware again.
 */
export async function startOAuthSignIn(provider: SupportedOAuthProvider, redirectTo: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error || !data.url) throw error ?? new Error("OAuth URL was not returned.");
  return data.url;
}

export async function exchangeOAuthCodeForSession(code: string) {
  const client = await createServerSupabaseClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

export async function signOutCurrentSession() {
  const client = await createServerSupabaseClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
