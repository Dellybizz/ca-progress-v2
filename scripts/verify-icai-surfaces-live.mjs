import { mkdirSync, writeFileSync } from "node:fs";

const baseUrl = (process.env.DEPLOY_BASE_URL || "").replace(/\/$/, "");
const configuredCookie = process.env.ADMIN_PHASE1_AUTH_COOKIE?.trim() || "";
if (!baseUrl) throw new Error("DEPLOY_BASE_URL is required for ICAI surface verification.");
if (!configuredCookie) throw new Error("ADMIN_PHASE1_AUTH_COOKIE is required for ICAI surface verification.");
const cookie = configuredCookie.includes("=") ? configuredCookie : `ca_session=${configuredCookie}`;

const checks = [
  { path: "/admin/icai-sync", cookie, markers: ["ICAI Sync", "Run Sync"] },
  { path: "/admin/icai-sync/data", cookie, markers: ["Synced data &amp; review", "Synced ICAI resources"] },
  { path: "/resources/icai", markers: ["ICAI Resources", "Official ICAI links"] },
  { path: "/updates", markers: ["ICAI Updates", "Daily verification feed"] },
];

const evidence = [];
for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, {
    headers: {
      ...(check.cookie ? { cookie: check.cookie } : {}),
      "cache-control": "no-cache",
      "user-agent": "CA-Progress-ICAI-Phase2D-Surface-Verification/1.0",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const html = await response.text();
  const result = {
    path: check.path,
    status: response.status,
    redirected: response.headers.has("location"),
    markers: Object.fromEntries(check.markers.map((marker) => [marker, html.includes(marker)])),
  };
  evidence.push(result);
  if (result.status !== 200 || result.redirected || Object.values(result.markers).includes(false)) {
    throw new Error(`ICAI surface verification failed: ${JSON.stringify(result)}`);
  }
}

mkdirSync("deployment-evidence", { recursive: true });
writeFileSync("deployment-evidence/icai-phase2d-surfaces.json", JSON.stringify({ checkedAt: new Date().toISOString(), checks: evidence }, null, 2));
console.log("ICAI Phase 2D admin and student surface verification PASS.");
