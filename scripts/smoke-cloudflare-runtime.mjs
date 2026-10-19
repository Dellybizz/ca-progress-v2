import { existsSync,mkdtempSync,readdirSync,readFileSync,writeFileSync,rmSync } from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {d1TransportSql} from "./payments/d1-sql-transport.mjs";
import { spawn, spawnSync } from "node:child_process";

const host = "127.0.0.1";
const port = 8787;
const base = process.env.SMOKE_BASE_URL || `http://${host}:${port}`;
const isExternal = /^https?:\/\//.test(process.env.SMOKE_BASE_URL || "");
const routes = ["/welcome", "/login", "/account/recover", "/onboarding-preview", "/onboarding-offline-preview", "/dashboard", "/community", "/activity", "/progress", "/planner", "/resources", "/settings", "/admin"];
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
  const migrationDir=mkdtempSync(join(tmpdir(),'ca-smoke-migrations-')),migrationConfig=resolve('.wrangler-smoke-migrations.json');
  const configuration=JSON.parse(readFileSync('wrangler.smoke.jsonc','utf8'));configuration.d1_databases[0].migrations_dir=migrationDir;
  for(const file of readdirSync('d1/migrations').filter(f=>f.endsWith('.sql')))writeFileSync(join(migrationDir,file),d1TransportSql(readFileSync('d1/migrations/'+file,'utf8')));
  writeFileSync(migrationConfig,JSON.stringify(configuration));
  let migrate;try{migrate = spawnSync(wrangler, ["wrangler", "d1", "migrations", "apply", "ca-progress-v2-smoke-local", "--local", "--config", migrationConfig], { env: { ...process.env, NO_COLOR: "1", CI: "1", NO_D1_WARNING: "true" }, stdio: "inherit" });
  }finally{rmSync(migrationDir,{recursive:true,force:true});rmSync(migrationConfig,{force:true});}
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
  const reset = await request("/account/reset", "desktop");
  const resetHtml=await reset.text();
  const httpRedirect=[302,303,307,308].includes(reset.status)&&reset.headers.get("location")?.includes("/account/recover");
  // Next may flush the root loading shell before this async page redirects.
  // Its streamed redirect must have the explicit recovery destination and no reset fields.
  const streamingRedirect=reset.status===200&&/<meta[^>]*id="__next-page-redirect"[^>]*content="[^"<>]*url=\/account\/recover[^"<>]*"/i.test(resetHtml);
  if ((!httpRedirect&&!streamingRedirect)||/<input[^>]*autoComplete="new-password"/i.test(resetHtml))throw new Error(`Reset without proof did not safely return to recovery (status ${reset.status}).`);
  const unverifiedReset=await fetch(`${base}/api/v1/password-recovery`,{method:"POST",headers:{...headers("desktop"),"Content-Type":"application/json",origin:base},body:JSON.stringify({password:"synthetic-only-password-12"})});
  if(unverifiedReset.status!==403)throw new Error("Unverified password reset was not rejected.");
  const setupBody=JSON.stringify({schemaVersion:2,ownerId:'another-account',action:'draft',revision:0,draft:{schemaVersion:2,step:'intro'}});
  // Test account authorization separately from Origin validation: the local
  // OpenNext adapter can reconstruct the request with its internal origin.
  const unverifiedSetup=await fetch(`${base}/api/v1/onboarding`,{method:'POST',headers:{...headers('desktop'),'Content-Type':'application/json'},body:setupBody});
  if(![401,409].includes(unverifiedSetup.status))throw new Error(`Setup must reject an unauthenticated or mismatched account owner (status ${unverifiedSetup.status}: ${(await unverifiedSetup.text()).slice(0,300)}).`);
  const crossSiteSetup=await fetch(`${base}/api/v1/onboarding`,{method:'POST',headers:{...headers('desktop'),'Content-Type':'application/json',origin:'https://invalid.example','sec-fetch-site':'cross-site'},body:setupBody});
  if(crossSiteSetup.status!==403)throw new Error(`Cross-site setup mutation was not rejected (status ${crossSiteSetup.status}).`);
  const oauthFailure = await fetch(`${base}/auth/google?next=%2F%2Fevil.example`, { redirect: "manual", headers: headers("desktop") });
  if (oauthFailure.status >= 500) throw new Error(`OAuth failure path returned ${oauthFailure.status}`);
  const webhook = await fetch(`${base}/api/payments/webhook`, { method: "POST", headers: headers("desktop"), body: "{}" });
  if (webhook.status >= 500) throw new Error(`Webhook failure path returned ${webhook.status}`);
  console.log("[cloudflare-smoke] PASS: cold/warm, guest/auth-cookie, mobile/desktop, OAuth and webhook failure paths are actionable.");
} finally {
  stop();
}
