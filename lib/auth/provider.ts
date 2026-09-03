import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  exchangeCloudflareOAuthCode,
  getCloudflareRequestAuth,
  isCloudflareAuthRuntime,
  signOutCloudflareSession,
  startCloudflareOAuth,
  type CloudflareOAuthCallbackResult,
} from "./cloudflare";
import type { AppRole } from "@/lib/authorization/roles";

export type SupportedOAuthProvider = "google" | "linkedin_oidc";
export { isCloudflareAuthRuntime };

export type ApplicationAuthIdentity = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: AppRole | null;
  entitlements: string[];
};

/** Provider-neutral OAuth boundary. Production remains Supabase until cutover. */
export async function startOAuthSignIn(provider: SupportedOAuthProvider, redirectTo: string) {
  if (isCloudflareAuthRuntime()) return startCloudflareOAuth(provider, redirectTo);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error || !data.url) throw error ?? new Error("OAuth URL was not returned.");
  return data.url;
}

export async function exchangeOAuthCodeForSession(code: string, state = ""): Promise<CloudflareOAuthCallbackResult | null> {
  if (isCloudflareAuthRuntime()) return exchangeCloudflareOAuthCode(code, state);
  const client = await createServerSupabaseClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return null;
}

function claimString(claims: Record<string, unknown>, key: string) {
  return typeof claims[key] === "string" ? claims[key] as string : null;
}

export async function getCurrentApplicationIdentity(): Promise<ApplicationAuthIdentity | null> {
  if (isCloudflareAuthRuntime()) {
    const auth = await getCloudflareRequestAuth();
    const session = auth.session;
    if (!session) return null;
    return {
      id: auth.applicationUserId!,
      email: session.email,
      phone: session.phone,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl,
      role: auth.role,
      entitlements: auth.entitlements,
    };
  }

  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  if (error || !claims) return null;
  const id = claimString(claims, "sub");
  if (!id) return null;
  const metadata = claims.user_metadata && typeof claims.user_metadata === "object"
    ? claims.user_metadata as Record<string, unknown>
    : {};
  return {
    id,
    email: claimString(claims, "email"),
    phone: claimString(claims, "phone"),
    displayName: typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : null,
    avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
    role: null,
    entitlements: [],
  };
}

export async function signOutCurrentSession() {
  if (isCloudflareAuthRuntime()) return signOutCloudflareSession();
  const client = await createServerSupabaseClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
