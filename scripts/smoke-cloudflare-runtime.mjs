import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = 8787;
const base = `http://${host}:${port}`;
const routes = ["/settings", "/tests", "/admin", "/community", "/planner"];

const configs = [
  "wrangler.jsonc",
  "workers/web-core/wrangler.jsonc",
  "workers/web-admin/wrangler.jsonc",
  "workers/web-community/wrangler.jsonc",
  "workers/web-planning/wrangler.jsonc",
  "workers/icai-sync/wrangler.jsonc",
  "workers/billing/wrangler.jsonc",
  "workers/admin-ops/wrangler.jsonc",
];

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["wrangler", "dev", "--local", ...configs.flatMap((config) => ["-c", config]), "--ip", host, "--port", String(port), "--var", "SUPABASE_SERVICE_ROLE_KEY:ci-smoke-only"],
  {
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    output += chunk;
    if (output.length > 60_000) output = output.slice(-60_000);
  });
}

function stop() {
  child.stdout.destroy();
  child.stderr.destroy();
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function waitForWorker() {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Wrangler exited before startup (code ${child.exitCode}).\n${output}`);
    try {
      const response = await fetch(`${base}/api/health`, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status < 500) return;
    } catch {
      // Workers are still starting or did not answer within the probe timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for local Cloudflare Workers.\n${output}`);
}

try {
  await waitForWorker();
  for (const route of routes) {
    const response = await fetch(`${base}${route}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status >= 500) {
      const body = (await response.text()).slice(0, 1000);
      throw new Error(`${route} returned ${response.status}.\n${body}\n\nWrangler output:\n${output}`);
    }
    console.log(`[cloudflare-smoke] ${route} -> ${response.status}`);
  }
  console.log("[cloudflare-smoke] PASS: split Core/Admin/Community/Planning routes avoid Worker-level 5xx responses.");
} finally {
  stop();
}
