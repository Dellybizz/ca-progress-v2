import { getPublicRuntimeConfig } from "@/lib/env";

export function EnvironmentBanner() {
  const { appEnv } = getPublicRuntimeConfig();
  if (appEnv === "production") return null;
  return <div className="environment-banner" role="status" aria-label="Environment"><span className="environment-dot" aria-hidden="true"/>CA Progress · Staging</div>;
}
