import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("username updates preserve the owner and alias through the deployed trigger", () => {
  const migration = read("d1/migrations/0069_auth_phase1_account_usernames.sql");
  const service = read("lib/auth/account-security.ts");
  const update = service.match(/UPDATE password_credentials SET username=\?1,updated_at=CURRENT_TIMESTAMP WHERE user_id=\?2[\s\S]*?absolute_expires_at>CURRENT_TIMESTAMP\)\s+RETURNING user_id/);
  assert.ok(update);
  const script = `import sqlite3,sys,json\na=json.load(sys.stdin); d=sqlite3.connect(':memory:'); d.executescript('CREATE TABLE app_users(user_id TEXT PRIMARY KEY,account_state TEXT);CREATE TABLE password_credentials(user_id TEXT PRIMARY KEY,username TEXT UNIQUE,salt TEXT,password_hash TEXT,iterations INTEGER,updated_at TEXT);CREATE TABLE sessions(session_id TEXT PRIMARY KEY,application_user_id TEXT,revoked_at TEXT,expires_at TEXT,absolute_expires_at TEXT);CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT);INSERT INTO app_users VALUES("owner","active");INSERT INTO password_credentials VALUES("owner","oldname","salt","hash",310000,NULL);INSERT INTO sessions VALUES("current","owner",NULL,"2099-01-01","2099-01-01");INSERT INTO sessions VALUES("revoked","owner","2026-01-01","2099-01-01","2099-01-01");');d.executescript(a['migration']);q=a['update'];assert d.execute(q,('newname','owner','revoked')).fetchall()==[];assert d.execute(q,('newname','owner','current')).fetchall()==[('owner',)];assert d.execute('SELECT username,is_temporary FROM account_usernames WHERE user_id="owner"').fetchone()==('newname',0);assert d.execute('SELECT user_id FROM app_users').fetchall()==[('owner',)]`;
  const run = spawnSync("python3", ["-c", script], { input: JSON.stringify({ migration, update: update[0] }), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

test("remote sign out requires password and selects the authenticated owner's device", () => {
  const route = read("app/api/v1/session/route.ts");
  const service = read("lib/auth/account-security.ts");
  assert.match(route, /authenticatedPassword\(body\.currentPassword \|\| ""\); await revokeOtherCloudflareSessions/);
  assert.match(service, /await verifyPassword\(currentPassword, credential\)/);
  assert.match(service, /session_id=\?1 AND application_user_id=\?2 AND session_id<>\?3 AND revoked_at IS NULL/);
  assert.match(service, /UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE application_user_id=\?1 AND session_id<>\?2 AND revoked_at IS NULL/);
});
