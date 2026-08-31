import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// CA Progress V2 intentionally deploys one OpenNext/Next.js web runtime.
// Heavy or security-sensitive engines stay outside the web bundle behind
// private Cloudflare service bindings (ICAI sync, billing and admin ops).
// This keeps Cloudflare Connected Builds simple without collapsing those
// privileged/background boundaries back into the application Worker.
export default defineCloudflareConfig();
