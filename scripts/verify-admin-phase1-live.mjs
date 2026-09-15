import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const base = (process.env.DEPLOY_BASE_URL || "https://ca-progress-v2.habeebaasif622.workers.dev").replace(/\/$/, "");
const database = process.env.PHASE1_D1_DATABASE || "ca-progress-v2-phase4-shadow";
const evidenceDir = "phase1-admin-evidence";
const runKey = `phase1-live-${Date.now()}-${randomUUID().slice(0, 8)}`;
const reason = `Phase 1 live verification ${runKey}`;
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

mkdirSync(evidenceDir, { recursive: true });

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function d1(sql, { allowFailure = false } = {}) {
  const result = spawnSync(npx, [
    "wrangler", "d1", "execute", database,
    "--remote", "--config", "wrangler.jsonc", "--json", "--command", sql,
  ], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 10 * 1024 * 1024,
  });
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const failed = result.status !== 0 || /"success"\s*:\s*false/.test(combined) || /\[ERROR\]|SQLITE_CONSTRAINT|D1_ERROR/i.test(combined);
  if (allowFailure) return { failed, output: combined };
  if (failed) throw new Error(`D1 command failed.\n${combined.slice(-5000)}`);
  const text = (result.stdout || "").trim();
  if (!text) return [];
  try { return JSON.parse(text); }
  catch {
    const start = Math.min(...[text.indexOf("["), text.indexOf("{")].filter((value) => value >= 0));
    if (Number.isFinite(start)) return JSON.parse(text.slice(start));
    throw new Error(`D1 JSON output could not be parsed: ${text.slice(0, 1000)}`);
  }
}

function resultRows(payload) {
  if (Array.isArray(payload)) return payload.flatMap((item) => Array.isArray(item?.results) ? item.results : []);
  return Array.isArray(payload?.results) ? payload.results : [];
}

function one(sql) {
  const rows = resultRows(d1(sql));
  return rows[0] ?? null;
}

function token() {
  return randomBytes(32).toString("base64url");
}

function hashToken(raw) {
  return createHash("sha256").update(raw).digest("base64url");
}

const fixtures = {
  student: { id: randomUUID(), role: "student", token: token() },
  moderator: { id: randomUUID(), role: "moderator", token: token() },
  admin: { id: randomUUID(), role: "admin", token: token() },
  owner: { id: randomUUID(), role: "owner", token: token() },
  parentOwner: { id: randomUUID(), role: "parent_owner", token: token() },
  target: { id: randomUUID(), role: "moderator", token: token() },
  parentTarget: { id: randomUUID(), role: "parent_owner", token: token() },
};

for (const fixture of Object.values(fixtures)) fixture.sessionId = randomUUID();
const fixtureIds = Object.values(fixtures).map((fixture) => fixture.id);

function cookieFor(fixture) {
  return `ca_session=${fixture.token}`;
}

async function request(path, fixture = null, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("user-agent", "CA-Progress-Phase1-Live-Verification/1.0");
  headers.set("x-request-id", `phase1-live-${randomUUID()}`);
  if (fixture) headers.set("cookie", cookieFor(fixture));
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    redirect: init.redirect || "manual",
    signal: AbortSignal.timeout(20_000),
  });
  return response;
}

async function bodyText(response) {
  return await response.text();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertRedirect(response, expectedFragment, label, forbiddenMarkers = []) {
  const location = response.headers.get("location") || "";
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    assert(location.includes(expectedFragment), `${label}: expected redirect containing ${expectedFragment}, got ${location}.`);
    return;
  }
  const text = await response.text();
  const decoded = htmlDecode(text).replaceAll("\u0026", "&").replaceAll("\u003d", "=");
  const streamedRedirect = response.status === 200 && (
    /NEXT_REDIRECT/i.test(decoded) ||
    /__next-page-redirect/i.test(decoded) ||
    /http-equiv=["']?refresh/i.test(decoded) ||
    /redirect;(?:replace|push)/i.test(decoded)
  );
  assert(streamedRedirect, `${label}: expected HTTP or streamed Next redirect, got ${response.status}; body=${decoded.slice(0, 1200)}`);
  assert(decoded.includes(expectedFragment), `${label}: streamed redirect did not target ${expectedFragment}; body=${decoded.slice(0, 1200)}`);
  for (const marker of forbiddenMarkers) {
    assert(!decoded.includes(marker), `${label}: protected content leaked during redirect (${marker}).`);
  }
}

function htmlDecode(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function formForUser(html, userId) {
  for (const match of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)) {
    const form = match[0];
    if (form.includes(`name="userId"`) && form.includes(`value="${userId}"`)) return form;
  }
  return null;
}

function actionFields(formHtml) {
  const fields = [];
  for (const match of formHtml.matchAll(/<input\b[^>]*>/g)) {
    const tag = match[0];
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    if (!name || !name.startsWith("$ACTION_")) continue;
    const value = tag.match(/\bvalue="([^"]*)"/)?.[1] || "";
    fields.push([htmlDecode(name), htmlDecode(value)]);
  }
  assert(fields.length > 0, "Rendered staff form did not contain a Next.js Server Action field.");
  return fields;
}

async function submitRoleChange(actor, fields, targetUserId, role, changeReason) {
  const data = new FormData();
  for (const [name, value] of fields) data.append(name, value);
  data.set("userId", targetUserId);
  data.set("role", role);
  data.set("reason", changeReason);
  return await request("/admin/staff", actor, {
    method: "POST",
    headers: {
      origin: base,
      referer: `${base}/admin/staff`,
      "sec-fetch-site": "same-origin",
    },
    body: data,
  });
}

const checks = [];
function pass(name, details = {}) {
  checks.push({ name, status: "pass", ...details });
  console.log(`[phase1-admin-live] PASS: ${name}`);
}

function setupFixtures() {
  const statements = [];
  for (const fixture of Object.values(fixtures)) {
    statements.push(`INSERT INTO app_users(user_id,auth_provider,provider_subject,account_state,role) VALUES(${sqlString(fixture.id)},'phase1-live-proof',NULL,'active',${sqlString(fixture.role)})`);
    statements.push(`INSERT INTO sessions(session_id,application_user_id,auth_identity_id,token_hash,remember_device,expires_at,absolute_expires_at) VALUES(${sqlString(fixture.sessionId)},${sqlString(fixture.id)},NULL,${sqlString(hashToken(fixture.token))},0,datetime('now','+20 minutes'),datetime('now','+30 minutes'))`);
  }
  d1(`PRAGMA foreign_keys=ON; ${statements.join("; ")};`);
}

function cleanupFixtures() {
  const ids = fixtureIds.map(sqlString).join(",");
  try { d1(`DELETE FROM sessions WHERE application_user_id IN (${ids}); DELETE FROM app_users WHERE user_id IN (${ids});`); }
  catch (error) { console.error(`[phase1-admin-live] cleanup error: ${error instanceof Error ? error.message : String(error)}`); }
}

try {
  setupFixtures();
  pass("synthetic production sessions created");

  const guestAdmin = await request("/admin");
  await assertRedirect(guestAdmin, "/dashboard", "guest admin denial", ["Operational monitoring and owner controls.", "Admin actions · 24h"]);
  pass("guest denied admin area", { status: guestAdmin.status });

  const studentAdmin = await request("/admin", fixtures.student);
  await assertRedirect(studentAdmin, "/dashboard", "student admin denial", ["Operational monitoring and owner controls.", "Admin actions · 24h"]);
  pass("student denied admin area", { status: studentAdmin.status });

  const moderatorAdmin = await request("/admin", fixtures.moderator);
  await assertRedirect(moderatorAdmin, "/admin/community/moderation", "moderator command-center restriction", ["Operational monitoring and owner controls.", "Admin actions · 24h"]);
  const moderatorCommunity = await request("/admin/community/moderation", fixtures.moderator);
  assert(moderatorCommunity.status === 200, `moderator moderation workspace returned ${moderatorCommunity.status}.`);
  pass("moderator limited to moderation workspace");

  for (const [label, fixture] of [["admin", fixtures.admin], ["owner", fixtures.owner], ["parent_owner", fixtures.parentOwner]]) {
    for (const path of ["/admin", "/admin/users", "/admin/staff", "/admin/audit"]) {
      const response = await request(path, fixture);
      assert(response.status === 200, `${label} ${path} returned ${response.status}.`);
    }
    pass(`${label} can load expected Phase 1 admin workspaces`);
  }

  const adminStaffResponse = await request("/admin/staff", fixtures.admin);
  const adminStaffHtml = await bodyText(adminStaffResponse);
  assert(adminStaffHtml.includes(fixtures.target.id), "Admin staff page did not contain synthetic staff target.");
  assert(adminStaffHtml.includes("Read-only for your role."), "Admin staff page did not expose the expected read-only restriction.");
  assert(!formForUser(adminStaffHtml, fixtures.target.id), "Admin unexpectedly received an editable staff-role form.");
  pass("admin staff management is read-only");

  const ownerStaffResponse = await request("/admin/staff", fixtures.owner);
  const ownerStaffHtml = await bodyText(ownerStaffResponse);
  const ownerTargetForm = formForUser(ownerStaffHtml, fixtures.target.id);
  assert(ownerTargetForm, "Owner did not receive the role-management form for a normal staff target.");
  assert(ownerStaffHtml.includes("Parent Owner authority required."), "Owner UI did not protect Parent Owner hierarchy.");
  assert(!formForUser(ownerStaffHtml, fixtures.parentTarget.id), "Owner unexpectedly received a Parent Owner edit form.");
  const ownerActionFields = actionFields(ownerTargetForm);
  pass("owner receives staff controls but Parent Owner remains protected");

  const parentStaffResponse = await request("/admin/staff", fixtures.parentOwner);
  const parentStaffHtml = await bodyText(parentStaffResponse);
  assert(formForUser(parentStaffHtml, fixtures.parentTarget.id), "Parent Owner did not receive hierarchy-management form for another Parent Owner.");
  pass("Parent Owner hierarchy controls render only for Parent Owner");

  for (const [label, fixture, expectedStatus] of [
    ["guest", null, 401],
    ["moderator", fixtures.moderator, 403],
    ["admin", fixtures.admin, 403],
  ]) {
    const response = await request("/api/admin/gamification", fixture, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ action: "settle_rewards", competitionPeriod: "invalid" }),
    });
    assert(response.status === expectedStatus, `${label} reward settlement expected ${expectedStatus}, got ${response.status}.`);
  }
  const ownerReward = await request("/api/admin/gamification", fixtures.owner, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ action: "settle_rewards", competitionPeriod: "invalid" }),
  });
  assert(ownerReward.status === 400, `Owner reward capability probe should pass authorization and fail validation with 400, got ${ownerReward.status}.`);
  pass("reward settlement capability is Owner-only in production");

  const forgedParentChange = await submitRoleChange(fixtures.owner, ownerActionFields, fixtures.parentTarget.id, "admin", `${reason} owner hierarchy denial`);
  assert(forgedParentChange.status < 500, `Owner Parent Owner denial returned ${forgedParentChange.status}.`);
  const protectedParent = one(`SELECT role FROM app_users WHERE user_id=${sqlString(fixtures.parentTarget.id)} LIMIT 1`);
  assert(protectedParent?.role === "parent_owner", "Owner was able to mutate Parent Owner role through a forged Server Action submission.");
  const protectedAudit = one(`SELECT COUNT(*) AS count FROM admin_audit_events WHERE actor_user_id=${sqlString(fixtures.owner.id)} AND target_id=${sqlString(fixtures.parentTarget.id)} AND action='staff.role.change'`);
  assert(Number(protectedAudit?.count || 0) === 0, "Denied Parent Owner mutation unexpectedly created a success audit event.");
  pass("Parent Owner backend protection rejects forged Owner mutation");

  const mutationResponse = await submitRoleChange(fixtures.owner, ownerActionFields, fixtures.target.id, "admin", reason);
  assert(mutationResponse.status < 500, `Owner role mutation returned ${mutationResponse.status}.`);
  const mutated = one(`SELECT role FROM app_users WHERE user_id=${sqlString(fixtures.target.id)} LIMIT 1`);
  assert(mutated?.role === "admin", `Role mutation did not persist; found ${mutated?.role || "missing"}.`);

  const audit = one(`SELECT id,actor_user_id,actor_role,capability,action,target_type,target_id,reason,previous_value,new_value,trace_id,reversible FROM admin_audit_events WHERE actor_user_id=${sqlString(fixtures.owner.id)} AND target_id=${sqlString(fixtures.target.id)} AND action='staff.role.change' ORDER BY created_at DESC LIMIT 1`);
  assert(audit, "Role mutation did not create an admin audit event.");
  assert(audit.actor_role === "owner", `Unexpected audit actor role ${audit.actor_role}.`);
  assert(audit.capability === "staff.manage", `Unexpected audit capability ${audit.capability}.`);
  assert(audit.reason === reason, "Audit reason did not match live verification reason.");
  assert(JSON.parse(audit.previous_value || "{}").role === "moderator", "Audit previous role is incorrect.");
  assert(JSON.parse(audit.new_value || "{}").role === "admin", "Audit new role is incorrect.");
  assert(typeof audit.trace_id === "string" && audit.trace_id.length > 0, "Audit trace ID is missing.");
  assert(Number(audit.reversible) === 1, "Role-change audit event is not marked reversible.");
  pass("owner role mutation persisted and created complete immutable audit evidence", { auditId: audit.id });

  const refreshedStaff = await request("/admin/staff", fixtures.owner);
  const refreshedHtml = await bodyText(refreshedStaff);
  const refreshedTargetForm = formForUser(refreshedHtml, fixtures.target.id);
  assert(refreshedTargetForm, "Mutated target disappeared from refreshed staff page.");
  assert(/value="admin"[^>]*selected|selected[^>]*value="admin"/.test(refreshedTargetForm), "Refreshed staff page did not reflect persisted admin role.");
  pass("role mutation survives page refresh");

  const updateAttempt = d1(`UPDATE admin_audit_events SET reason='tampered' WHERE id=${sqlString(audit.id)}`, { allowFailure: true });
  assert(updateAttempt.failed, "Admin audit UPDATE unexpectedly succeeded.");
  const deleteAttempt = d1(`DELETE FROM admin_audit_events WHERE id=${sqlString(audit.id)}`, { allowFailure: true });
  assert(deleteAttempt.failed, "Admin audit DELETE unexpectedly succeeded.");
  pass("audit UPDATE and DELETE are blocked by production D1 triggers");

  const revertFields = actionFields(refreshedTargetForm);
  const revertResponse = await submitRoleChange(fixtures.owner, revertFields, fixtures.target.id, "moderator", `${reason} cleanup revert`);
  assert(revertResponse.status < 500, `Role revert returned ${revertResponse.status}.`);
  const reverted = one(`SELECT role FROM app_users WHERE user_id=${sqlString(fixtures.target.id)} LIMIT 1`);
  assert(reverted?.role === "moderator", "Role revert did not persist.");
  const auditCount = one(`SELECT COUNT(*) AS count FROM admin_audit_events WHERE actor_user_id=${sqlString(fixtures.owner.id)} AND target_id=${sqlString(fixtures.target.id)} AND action='staff.role.change'`);
  assert(Number(auditCount?.count || 0) === 2, `Expected 2 role-change audit events after revert, found ${auditCount?.count}.`);
  pass("role mutation is safely reversible through the real Server Action");

  writeFileSync(`${evidenceDir}/phase1-admin-live.json`, JSON.stringify({
    schemaVersion: 1,
    status: "pass",
    runKey,
    base,
    checks,
    auditEvidence: {
      mutationAuditId: audit.id,
      actorRole: audit.actor_role,
      capability: audit.capability,
      action: audit.action,
      targetType: audit.target_type,
      reversible: Number(audit.reversible) === 1,
      traceIdPresent: Boolean(audit.trace_id),
    },
  }, null, 2));
} catch (error) {
  writeFileSync(`${evidenceDir}/phase1-admin-live.json`, JSON.stringify({
    schemaVersion: 1,
    status: "fail",
    runKey,
    base,
    checks,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  throw error;
} finally {
  cleanupFixtures();
  const ids = fixtureIds.map(sqlString).join(",");
  try {
    const users = one(`SELECT COUNT(*) AS count FROM app_users WHERE user_id IN (${ids})`);
    const sessions = one(`SELECT COUNT(*) AS count FROM sessions WHERE application_user_id IN (${ids})`);
    if (Number(users?.count || 0) !== 0 || Number(sessions?.count || 0) !== 0) throw new Error("Synthetic Phase 1 fixtures were not fully cleaned up.");
    console.log("[phase1-admin-live] PASS: synthetic users and sessions cleaned up.");
  } catch (cleanupVerificationError) {
    console.error(cleanupVerificationError);
    process.exitCode = 1;
  }
}
