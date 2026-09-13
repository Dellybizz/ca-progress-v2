import "server-only";

import {
  exchangeCloudflareOAuthCode,
  getCloudflareRequestAuth,
  signOutCloudflareSession,
  startCloudflareOAuth,
  type CloudflareOAuthCallbackResult,
} from "./cloudflare";
import type { AppRole } from "@/lib/authorization/roles";

export type SupportedOAuthProvider = "google" | "linkedin_oidc";

export type ApplicationAuthIdentity = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: AppRole | null;
  entitlements: string[];
};

export async function startOAuthSignIn(provider: SupportedOAuthProvider, redirectTo: string) {
  return startCloudflareOAuth(provider, redirectTo);
}

export async function exchangeOAuthCodeForSession(code: string, state = ""): Promise<CloudflareOAuthCallbackResult> {
  return exchangeCloudflareOAuthCode(code, state);
}

export async function getCurrentApplicationIdentity(): Promise<ApplicationAuthIdentity | null> {
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

export async function signOutCurrentSession() {
  return signOutCloudflareSession();
}
