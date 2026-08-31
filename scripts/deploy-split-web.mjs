import { spawnSync } from "node:child_process";

const configs = [
  "workers/web-core/wrangler.jsonc",
  "workers/web-admin/wrangler.jsonc",
  "workers/web-community/wrangler.jsonc",
  "workers/web-planning/wrangler.jsonc",
  "wrangler.web.jsonc",
];

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
for (const config of configs) {
  console.log(`[cloudflare-deploy] ${config}`);
  const result = spawnSync(npx, ["wrangler", "deploy", "-c", config], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
