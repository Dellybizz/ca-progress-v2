import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { prepareTestAccount } from "./create-test-account.mjs";

const DATABASE = "ca-progress-v2-phase4-shadow";
const BASE = "https://ca-progress-v2.habeebaasif622.workers.dev";
const evidencePath = process.argv[2] || "deployment-evidence/auth-phase6-live.json";
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error("Cloudflare D1 credentials are required.");
const sqlString = value => `'${value.replaceAll("'", "''")}'`;
const password = randomBytes(28).toString("base64url");
// The fixture's initial password must be supplied only in memory, never written to evidence.
const fixture = prepareTestAccount({ username: `cert_${randomBytes(6).toString("hex")}`, password, displayName: "CA Progress Phase 6 Fixture" });
const newUsername = `verified_${randomBytes(6).toString("hex")}`;
const newPassword = randomBytes(28).toString("base64url");
const folder = mkdtempSync(join(tmpdir(), "ca-auth-live-"));
const stages = [];
let inserted = false;
let baseline;
const quoteId = sqlString(fixture.userId);
function wrangler(args) {
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", "d1", "execute", DATABASE, "--config=wrangler.jsonc", "--remote", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Remote D1 command failed (${result.status ?? "unknown"}): ${result.stderr.slice(0, 350)}`);
  return result.stdout;
}
function query(sql) {
  const output = wrangler(["--json", "--command", sql]);
  const start = output.indexOf("[");
  const data = start >= 0 ? JSON.parse(output.slice(start)) : null;
  if (!Array.isArray(data) || data.some(entry => entry.success !== true)) throw new Error("Remote D1 did not return a successful query.");
  return data[0]?.results || [];
}
const countsSql = `SELECT (SELECT COUNT(*) FROM app_users) app_users,(SELECT COUNT(*) FROM profiles) profiles,(SELECT COUNT(*) FROM password_credentials) password_credentials,(SELECT COUNT(*) FROM account_usernames) account_usernames,(SELECT COUNT(*) FROM auth_identities) auth_identities,(SELECT COUNT(*) FROM chapter_progress) chapter_progress,(SELECT COUNT(*) FROM notes) notes`;
function check(condition, message) { if (!condition) throw new Error(message); }
async function request(path, init, expected, label) {
  const response = await fetch(BASE + path, { redirect: "manual", ...init });
  const body = await response.json().catch(() => ({}));
  check(response.status === expected, `${label}: HTTP ${response.status} instead of ${expected}; ${JSON.stringify(body).slice(0, 180)}`);
  stages.push(label);
  return { response, body };
}
const post = (path, body, extra = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, ...extra }, body: JSON.stringify(body) });
const webSession = cookie => ({ headers: { Cookie: cookie } });
const cookieFrom = response => {
  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie.match(/(?:^|,\s*)(ca_session=[A-Za-z0-9_-]+)/)?.[1];
  check(Boolean(cookie), "Login did not issue a session cookie.");
  return cookie;
};
let outcome = "failed";
let errorMessage = null;
try {
  baseline = query(countsSql)[0];
  check(Boolean(baseline), "Baseline counts unavailable.");
  const file = join(folder, "fixture.sql");
  writeFileSync(file, fixture.sql, { mode: 0o600 });
  wrangler([`--file=${file}`]);
  inserted = query(`SELECT user_id FROM app_users WHERE user_id=${quoteId} AND auth_provider='manual-test'`).length === 1;
  check(inserted, "Isolated fixture was not created.");
  check(query(`SELECT n.username,pc.user_id FROM password_credentials pc JOIN account_usernames n ON n.user_id=pc.user_id WHERE pc.user_id=${quoteId}`)[0]?.username === fixture.username, "Fixture credential/alias mismatch.");
  stages.push("isolated D1 fixture and alias");
  await request("/api/v1/password-auth", post("", { action: "register", username: fixture.username, password }), 400, "public registration rejected");
  await request("/api/v1/password-auth", post("", { action: "login", username: fixture.username, password: "invalid-password" }), 401, "wrong password rejected");
  const web = await request("/api/v1/password-auth", post("", { action: "login", username: fixture.username, password, remember: true }), 200, "web password login");
  check(web.body.applicationUserId === fixture.userId, "Web login changed ownership.");
  const cookie = cookieFrom(web.response);
  const webState = await request("/api/v1/session", webSession(cookie), 200, "remembered web session");
  check(webState.body.user?.applicationUserId === fixture.userId && webState.body.session?.rememberDevice === true, "Web session does not match remembered owner.");
  const native = await request("/api/v1/password-auth", post("", { action: "login", username: fixture.username, password }, { "X-CA-Native-App": "in.zanisheluxe.caprogress", Origin: "capacitor://localhost" }), 200, "Android password login");
  check(native.body.applicationUserId === fixture.userId && typeof native.body.accessToken === "string", "Native login did not return the same owner and bearer token.");
  const bearer = { headers: { Authorization: `Bearer ${native.body.accessToken}` } };
  const mobileState = await request("/api/v1/session", bearer, 200, "Android bearer session");
  check(mobileState.body.user?.applicationUserId === fixture.userId && mobileState.body.session?.clientKind === "mobile", "Android session ownership/device classification differs.");
  const renamed = await request("/api/v1/account-security", post("", { action: "username", currentPassword: password, username: newUsername }, { Cookie: cookie }), 200, "username change");
  check(renamed.body.applicationUserId === fixture.userId && renamed.body.username === newUsername, "Username update changed account owner.");
  await request("/api/v1/password-auth", post("", { action: "login", username: fixture.username, password }), 401, "old username rejected");
  const newNameLogin = await request("/api/v1/password-auth", post("", { action: "login", username: newUsername, password }), 200, "new username login");
  const otherCookie = cookieFrom(newNameLogin.response);
  await request("/api/v1/account-security", post("", { action: "password", currentPassword: password, newPassword }, { Cookie: cookie }), 200, "password change");
  await request("/api/v1/session", bearer, 401, "other device revoked after password change");
  await request("/api/v1/session", webSession(otherCookie), 401, "other browser revoked after password change");
  await request("/api/v1/password-auth", post("", { action: "login", username: newUsername, password }), 401, "old password rejected");
  const renewed = await request("/api/v1/password-auth", post("", { action: "login", username: newUsername, password: newPassword }), 200, "new password login");
  const renewedCookie = cookieFrom(renewed.response);
  const device = await request("/api/v1/session", webSession(renewedCookie), 200, "multiple sessions listed");
  check(device.body.sessions.some(item => item.current) && device.body.sessions.some(item => !item.current), "Session list lacks current and other device.");
  await request("/api/v1/account-security", post("", { action: "revoke_device", currentPassword: "wrong", sessionId: device.body.session.currentSessionId }, { Cookie: cookie }), 403, "remote revoke requires password");
  await request("/api/v1/account-security", post("", { action: "revoke_device", currentPassword: newPassword, sessionId: device.body.session.currentSessionId }, { Cookie: cookie }), 200, "one other device revoked");
  await request("/api/v1/session", webSession(renewedCookie), 401, "selected device access revoked");
  await request("/api/v1/session", post("", { action: "revoke_all", currentPassword: newPassword }, { Cookie: cookie }), 200, "password-confirmed sign out all");
  await request("/api/v1/session", webSession(cookie), 401, "all sessions invalidated");
  outcome = "passed";
} catch (error) {
  errorMessage = error instanceof Error ? error.message : "Live certification failed.";
} finally {
  let cleanupError = null;
  if (!inserted && baseline) {
    try { inserted = query(`SELECT user_id FROM app_users WHERE user_id=${quoteId} AND auth_provider='manual-test'`).length === 1; }
    catch (error) { cleanupError = `Could not determine whether fixture ${fixture.userId} needs disabling: ${String(error)}`; }
  }
  if (inserted) {
    try {
      query(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE application_user_id=${quoteId} AND revoked_at IS NULL`);
      query(`UPDATE app_users SET account_state='disabled' WHERE user_id=${quoteId} AND auth_provider='manual-test' AND account_state='active'`);
      const fixtureRow = query(`SELECT account_state FROM app_users WHERE user_id=${quoteId} AND auth_provider='manual-test'`)[0];
      check(fixtureRow?.account_state === "disabled", "Fixture must be disabled after certification.");
      const after = query(countsSql)[0];
      for (const field of Object.keys(baseline || {})) check(Number(after[field]) >= Number(baseline[field]), `Existing ${field} count decreased.`);
      check(query("PRAGMA foreign_key_check").length === 0, "D1 foreign key check failed.");
      stages.push("fixture disabled; sessions revoked; ownership counts preserved; foreign keys clean");
    } catch (error) { cleanupError = error instanceof Error ? error.message : "Fixture cleanup failed."; }
  }
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(dirname(evidencePath), { recursive: true });
  const evidence = { phase: 6, status: outcome === "passed" && !cleanupError ? "passed" : "failed", fixtureUserId: fixture.userId, fixtureDisabled: inserted && !cleanupError, checks: stages, preExistingCounts: baseline || null, providerConsentTested: false, deviceInstallTested: false, failure: errorMessage || cleanupError || null };
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  if (cleanupError) throw new Error(`Fixture cleanup failed: ${cleanupError}`);
}
if (errorMessage) throw new Error(errorMessage);
console.log(`Phase 6 live certification passed: ${stages.length} checks. Fixture disabled; no live credentials in evidence.`);
