export type ExistingSupabaseProviderIdentity = {
  provider: "google" | "linkedin_oidc";
  providerUserId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  emailVerified?: boolean;
};

export type ExistingSupabaseUserMapping = {
  applicationUserId: string;
  legacySupabaseAuthUserId: string;
  identities: Array<{
    provider: "google" | "linkedin_oidc";
    providerUserId: string;
    applicationUserId: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    emailVerified: boolean;
  }>;
};

/**
 * Existing CA Progress ownership rows already use Supabase auth.users.id. The
 * deterministic migration rule is therefore deliberately identity-preserving:
 * the exact Supabase Auth UUID becomes the permanent application user ID.
 */
export function applicationUserIdForExistingSupabaseUser(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error("Existing Supabase Auth user id is required.");
  return value;
}

/**
 * Build the Phase 4 import mapping without changing ownership. Provider subjects
 * are authentication aliases only; they are never substituted for the stable
 * application user id. No email-based linking is allowed because email is not an
 * ownership key and can change or collide across providers.
 */
export function mapExistingSupabaseUser(input: {
  supabaseAuthUserId: string;
  identities: ExistingSupabaseProviderIdentity[];
}): ExistingSupabaseUserMapping {
  const applicationUserId = applicationUserIdForExistingSupabaseUser(input.supabaseAuthUserId);
  const seen = new Set<string>();
  const identities = input.identities.map((identity) => {
    const providerUserId = identity.providerUserId.trim();
    if (!providerUserId) throw new Error(`Missing provider subject for ${identity.provider}.`);
    const key = `${identity.provider}:${providerUserId}`;
    if (seen.has(key)) throw new Error(`Duplicate provider identity ${key}.`);
    seen.add(key);
    return {
      provider: identity.provider,
      providerUserId,
      applicationUserId: applicationUserIdForExistingSupabaseUser(input.supabaseAuthUserId),
      email: identity.email?.trim() || null,
      displayName: identity.displayName?.trim() || null,
      avatarUrl: identity.avatarUrl?.trim() || null,
      emailVerified: identity.emailVerified === true,
    };
  });
  return {
    applicationUserId,
    legacySupabaseAuthUserId: input.supabaseAuthUserId,
    identities,
  };
}
