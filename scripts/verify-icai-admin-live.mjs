import { mkdirSync, writeFileSync } from "node:fs";

const baseUrl = (process.env.DEPLOY_BASE_URL || "").replace(/\/$/, "");
const configuredCookie = process.env.ADMIN_PHASE1_AUTH_COOKIE?.trim() || "";
if (!baseUrl) throw new Error("DEPLOY_BASE_URL is required for ICAI admin verification.");
if (!configuredCookie) throw new Error("ADMIN_PHASE1_AUTH_COOKIE is required for ICAI admin verification.");

const cookie = configuredCookie.includes("=") ? configuredCookie : `ca_session=${configuredCookie}`;
const response = await fetch(`${baseUrl}/admin/icai-sync`, {
  headers: {
    cookie,
    "cache-control": "no-cache",
    "user-agent": "CA-Progress-ICAI-Admin-Live-Verification/1.0",
  },
  redirect: "manual",
  signal: AbortSignal.timeout(20_000),
});
const html = await response.text();
const location = response.headers.get("location");
const evidence = {
  checkedAt: new Date().toISOString(),
  status: response.status,
  redirected: Boolean(location),
  destination: location ? new URL(location, baseUrl).pathname : null,
  hasIcaiSyncHeading: html.includes("ICAI Sync"),
  hasRunControl: html.includes("Run Sync now") || html.includes("Run ICAI sync") || html.includes("Sync in progress"),
};
mkdirSync("deployment-evidence", { recursive: true });
writeFileSync("deployment-evidence/icai-admin-live.json", JSON.stringify(evidence, null, 2));

if (response.status !== 200 || location) {
  throw new Error(`Authenticated ICAI admin page was not accessible (status ${response.status}, destination ${evidence.destination ?? "none"}).`);
}
if (!evidence.hasIcaiSyncHeading || !evidence.hasRunControl) {
  throw new Error("Authenticated ICAI admin page did not render its sync controls.");
}
console.log("Authenticated ICAI admin page verification PASS.");
