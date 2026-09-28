import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DATABASE = "ca-progress-v2-phase4-shadow";
const quote = value => `'${value.replaceAll("'", "''")}'`;

export function prepareTestAccount({ username, displayName = "CA Progress Tester", password, userId = randomUUID(), salt = randomBytes(16) }) {
  const name = username?.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._]{2,29}$/.test(name || "")) throw new Error("Use a username of 3–30 letters, numbers, dots or underscores, starting with a letter.");
  if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 80) throw new Error("Display name must be 1–80 characters.");
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error("Set CA_TEST_ACCOUNT_PASSWORD to 12–128 characters.");
  const hash = pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
  const id = quote(userId), alias = quote(name), label = quote(displayName.trim());
  // Phase 1 automatically assigns a temporary alias, and the credential trigger replaces it.
  const sql = `PRAGMA foreign_keys=ON;
INSERT INTO app_users(user_id,auth_provider,provider_subject,account_state,role)
SELECT ${id},'manual-test',${id},'active','student'
WHERE NOT EXISTS(SELECT 1 FROM account_usernames WHERE username=${alias} COLLATE NOCASE);
INSERT OR IGNORE INTO profiles(user_id,display_name) SELECT ${id},${label} WHERE EXISTS(SELECT 1 FROM app_users WHERE user_id=${id} AND auth_provider='manual-test');
INSERT OR IGNORE INTO user_preferences(user_id) SELECT ${id} WHERE EXISTS(SELECT 1 FROM app_users WHERE user_id=${id} AND auth_provider='manual-test');
INSERT INTO password_credentials(user_id,username,salt,password_hash,iterations)
SELECT ${id},${alias},${quote(salt.toString("hex"))},${quote(hash)},310000
WHERE EXISTS(SELECT 1 FROM app_users WHERE user_id=${id} AND auth_provider='manual-test');
`;
  return { username: name, userId, sql };
}

function wrangler(args, capture = false) {
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", ...args], {
    encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) throw new Error(`Wrangler failed (exit ${result.status ?? "unknown"}). Check the selected D1 database and logs.`);
  return result.stdout || "";
}
function query(sql, remote) {
  const output = wrangler(["d1", "execute", DATABASE, "--config=wrangler.jsonc", remote ? "--remote" : "--local", "--json", "--command", sql], true);
  const start = output.indexOf("[");
  if (start < 0) throw new Error("Wrangler did not return D1 JSON.");
  return JSON.parse(output.slice(start))?.[0]?.results || [];
}

export function main(args = process.argv.slice(2)) {
  const at = name => args.indexOf(name);
  const username = at("--username") >= 0 ? args[at("--username") + 1] : null;
  const displayName = at("--display-name") >= 0 ? args[at("--display-name") + 1] : "CA Progress Tester";
  const remote = args.includes("--remote");
  if (remote && (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)) throw new Error("Remote provisioning needs Cloudflare API credentials.");
  const account = prepareTestAccount({ username, displayName, password: process.env.CA_TEST_ACCOUNT_PASSWORD });
  if (query(`SELECT 1 FROM account_usernames WHERE username=${quote(account.username)} COLLATE NOCASE LIMIT 1`, remote).length) throw new Error("Username is already assigned. No account was created.");
  const folder = mkdtempSync(join(tmpdir(), "ca-test-account-"));
  const file = join(folder, "create.sql");
  try {
    writeFileSync(file, account.sql, { mode: 0o600 });
    wrangler(["d1", "execute", DATABASE, "--config=wrangler.jsonc", remote ? "--remote" : "--local", `--file=${file}`]);
    const rows = query(`SELECT u.user_id FROM app_users u JOIN password_credentials pc ON pc.user_id=u.user_id JOIN account_usernames n ON n.user_id=u.user_id WHERE u.user_id=${quote(account.userId)} AND u.auth_provider='manual-test' AND pc.username=${quote(account.username)} AND n.username=pc.username AND n.is_temporary=0`, remote);
    if (rows.length !== 1) throw new Error("Account verification failed; inspect this user ID before retrying.");
    process.stdout.write(`Created manual test account: ${account.username} (user ID ${account.userId}). Password was not printed.\n`);
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : "Test account provisioning failed."); process.exitCode = 1; }
}
