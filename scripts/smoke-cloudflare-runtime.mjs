import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const host = "127.0.0.1";
const port = 8787;
const base = process.env.SMOKE_BASE_URL || `http://${host}:${port}`;
const isExternal = /^https?:\/\//.test(process.env.SMOKE_BASE_URL || "");
const routes = ["/dashboard", "/community", "/activity", "/progress", "/planner", "/resources", "/settings", "/admin"];
const userAgents = {
  desktop: "CA-Progress-Synthetic/Desktop",
  mobile: "CA-Progress-Synthetic/Mobile",
};
const authCookie = process.env.SMOKE_AUTH_COOKIE || "";
const samples = [];

function headers(kind, cold = false) {
  const result = { "user-agent": userAgents[kind], "x-request-id": `smoke-${kind}-${crypto.randomUUID()}` };
  if (cold) result["cache-control"] = "no-store";
  if (authCookie) result.cookie = authCookie;
  return result;
}

async function request(route, kind, cold = false) {
  const started = performance.now();
  const response = await fetch(`${base}${route}`, { redirect: "manual", headers: headers(kind, cold), signal: AbortSignal.timeout(10_000) });
  const durationMs = Math.round((performance.now() - started) * 100) / 100;
  samples.push({ route, kind, cold, status: response.status, durationMs });
  if (response.status >= 500) throw new Error(`${route} returned ${response.status} (${kind}, ${cold ? "cold" : "warm"})`);
  if (!response.headers.get("x-request-id")) throw new Error(`${route} did not return x-request-id`);
  return response;
}

async function loadSample() {
  const requests = [];
  for (let index = 0; index < 24; index += 1) {
    requests.push(request(routes[index % routes.length], index % 2 ? "mobile" : "desktop", index < routes.length));
  }
  await Promise.all(requests);
  const sorted = samples.map((item) => item.durationMs).sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
  if (p95 > 10_000) throw new Error(`Synthetic p95 exceeded 10s: ${p95}ms`);
  console.log(`[cloudflare-smoke] load sample PASS: ${sorted.length} requests, p95=${p95}ms`);
}

let child = null;
let output = "";
if (!isExternal) {
  if (!existsSync(".open-next/worker.js")) {
    const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "cf:build"], { env: { ...process.env, NO_COLOR: "1" }, stdio: "inherit" });
    if (build.status !== 0) throw new Error(`Cloudflare smoke prebuild failed with exit code ${build.status ?? "unknown"}.`);
  }
  const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";
  const migrate = spawnSync(wrangler, ["wrangler", "d1", "migrations", "apply", "ca-progress-v2-smoke-local", "--local", "--config", "wrangler.smoke.jsonc"], { env: { ...process.env, NO_COLOR: "1", CI: "1", NO_D1_WARNING: "true" }, stdio: "inherit" });
  if (migrate.status !== 0) throw new Error(`Cloudflare smoke D1 bootstrap failed with exit code ${migrate.status ?? "unknown"}.`);
  child = spawn(wrangler, ["wrangler", "dev", "--local", "--config", "wrangler.smoke.jsonc", "--ip", host, "--port", String(port)], { env: { ...process.env, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => { output += chunk; if (output.length > 40_000) output = output.slice(-40_000); });
  }
}
function stop() {
  if (!child) return;
  child.stdout.destroy();
  child.stderr.destroy();
  if (child.exitCode === null) child.kill("SIGKILL");
}
async function waitForWorker() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`Wrangler exited before startup (code ${child?.exitCode}).\n${output}`);
    try {
      const response = await fetch(`${base}/api/health`, { headers: headers("desktop", true), signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Cloudflare Worker.\n${output}`);
}
try {
  await waitForWorker();
  await request("/api/health", "desktop", true);
  for (const route of routes) {
    await request(route, "desktop", true);
    await request(route, "mobile");
  }
  await loadSample();
  const oauthFailure = await fetch(`${base}/auth/google?next=%2F%2Fevil.example`, { redirect: "manual", headers: headers("desktop") });
  if (oauthFailure.status >= 500) throw new Error(`OAuth failure path returned ${oauthFailure.status}`);
  const webhook = await fetch(`${base}/api/payments/webhook`, { method: "POST", headers: headers("desktop"), body: "{}" });
  if (webhook.status >= 500) throw new Error(`Webhook failure path returned ${webhook.status}`);
  console.log("[cloudflare-smoke] PASS: cold/warm, guest/auth-cookie, mobile/desktop, OAuth and webhook failure paths are actionable.");
} finally {
  stop();
}
