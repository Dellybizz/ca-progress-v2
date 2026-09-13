export type AppEnvironment = "local" | "preview" | "staging" | "production";

function normalizeEnvironment(value: string | undefined): AppEnvironment {
  if (value === "local" || value === "preview" || value === "staging" || value === "production") return value;
  return "staging";
}

export function getPublicRuntimeConfig() {
  return {
    appName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "CA Progress",
    appEnv: normalizeEnvironment(process.env.NEXT_PUBLIC_APP_ENV),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "phase-11",
  } as const;
}

export function getIcaiSyncConfig() {
  return {
    cronSecret: process.env.ICAI_CRON_SECRET?.trim() || "",
    enabled: process.env.ICAI_SYNC_ENABLED?.trim().toLowerCase() !== "false",
    userAgent: process.env.ICAI_SYNC_USER_AGENT?.trim() || "CA Progress V2 Official ICAI Monitor/phase8 (+https://ca-progress-v2.habeebaasif622.workers.dev)",
  } as const;
}
