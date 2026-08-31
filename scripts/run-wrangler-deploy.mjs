import { spawnSync } from "node:child_process";

const config = process.argv[2];
if (!config) {
  console.error("Usage: node scripts/run-wrangler-deploy.mjs <wrangler-config>");
  process.exit(2);
}

const env = { ...process.env };
// Cloudflare Workers Builds injects this for the single connected Worker and
// otherwise overrides every wrangler config name to the connected Worker name.
// This repository intentionally deploys multiple private Workers from one
// build, so child Wrangler processes must respect each config's own `name`.
delete env.WRANGLER_CI_OVERRIDE_NAME;

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
console.log(`[cloudflare-deploy] ${config}`);
const result = spawnSync(npx, ["wrangler", "deploy", "-c", config], {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
