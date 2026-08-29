export type AppEnvironment = "local" | "preview" | "staging" | "production";

function normalizeEnvironment(value: string | undefined): AppEnvironment {
  if (value === "local" || value === "preview" || value === "staging" || value === "production") return value;
  return "staging";
}

export function getPublicRuntimeConfig() {
  return {
    appName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "CA Progress",
    appEnv: normalizeEnvironment(process.env.NEXT_PUBLIC_APP_ENV),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "phase-2",
  } as const;
}

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  return { url, publishableKey, configured: Boolean(url && publishableKey) } as const;
}

export function getSupabaseAdminConfig() {
  const publicConfig = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  return { ...publicConfig, serviceRoleKey, configured: Boolean(publicConfig.url && serviceRoleKey) } as const;
}
