import { getPublicRuntimeConfig } from "@/lib/env";

export function EnvironmentBanner() {
  const { appEnv, appVersion } = getPublicRuntimeConfig();
  const label = appEnv === "production" ? "V2 production" : `V2 ${appEnv}`;

  return (
    <div className="environment-banner" role="status" aria-label="Environment">
      CA Progress · {label} · {appVersion}
    </div>
  );
}
