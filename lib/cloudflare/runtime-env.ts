import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Read a server-only runtime value in both local/Node and deployed Cloudflare
 * environments. OpenNext exposes Worker variables/secrets on the Cloudflare
 * env binding, while local tooling commonly exposes them through process.env.
 */
export function getServerRuntimeValue(name: string): string {
  const processValue = process.env[name]?.trim();
  if (processValue) return processValue;

  try {
    const { env } = getCloudflareContext();
    const value = (env as unknown as Record<string, unknown>)[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}
