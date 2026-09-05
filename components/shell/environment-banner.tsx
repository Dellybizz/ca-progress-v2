import { getPublicRuntimeConfig } from "@/lib/env";

export function EnvironmentBanner() {
  const { appEnv } = getPublicRuntimeConfig();
  const label = appEnv === "production" ? "Production" : "Staging";
  return <div className="environment-banner" role="status" aria-label="Environment"><span className="environment-dot" aria-hidden="true"/>CA Progress · {label}</div>;
}
