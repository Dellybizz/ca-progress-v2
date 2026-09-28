import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("verified provider setup attaches a password to the existing owner; guest and revoked sessions cannot", () => {
  const service = readFileSync(new URL("../lib/auth/account-setup.ts", import.meta.url), "utf8");
  const insert = service.match(/prepare\(`(INSERT INTO password_credentials[\s\S]+?NOT EXISTS\(SELECT 1 FROM password_credentials pc WHERE pc\.user_id=u\.user_id\))`\)/)?.[1];
  assert.ok(insert, "use the credential write from the real account service");
  const migration = readFileSync(new URL("../d1/migrations/0069_auth_phase1_account_usernames.sql", import.meta.url), "utf8");
  const script = `import json,sqlite3,sys\n`+
    `data=json.loads(sys.stdin.read());db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')\n`+
    `db.executescript("CREATE TABLE app_users(user_id TEXT PRIMARY KEY,auth_provider TEXT,account_state TEXT);CREATE TABLE profiles(user_id TEXT PRIMARY KEY REFERENCES app_users(user_id),display_name TEXT);CREATE TABLE password_credentials(user_id TEXT PRIMARY KEY REFERENCES app_users(user_id),username TEXT UNIQUE COLLATE NOCASE,salt TEXT,password_hash TEXT,iterations INTEGER);CREATE TABLE sessions(session_id TEXT PRIMARY KEY,application_user_id TEXT,auth_identity_id TEXT,revoked_at TEXT,expires_at TEXT,absolute_expires_at TEXT);CREATE TABLE auth_identities(identity_id TEXT PRIMARY KEY,provider TEXT,application_user_id TEXT);CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT);")\n`+
    `db.executemany('INSERT INTO app_users VALUES(?,?,?)',[('student','supabase-auth','active'),('guest','guest-test','active')])\n`+
    `db.executemany('INSERT INTO profiles VALUES(?,?)',[('student','Original student'),('guest','Guest Tester')])\n`+
    `db.execute("INSERT INTO auth_identities VALUES('google-id','google','student')")\n`+
    `db.executemany("INSERT INTO sessions VALUES(?,?,?,?,?,?)",[('student-session','student','google-id',None,'2099-01-01','2099-01-02'),('guest-session','guest','google-id',None,'2099-01-01','2099-01-02'),('revoked-session','student','google-id','2026-01-01','2099-01-01','2099-01-02')])\n`+
    `db.executescript(data['migration'])\n`+
    `args=lambda user,session,name:(name,'salt','hash',310000,user,session)\n`+
    `assert db.execute(data['insert'],args('guest','guest-session','guest_name')).rowcount==0\n`+
    `assert db.execute(data['insert'],args('student','revoked-session','revoked_name')).rowcount==0\n`+
    `assert db.execute(data['insert'],args('student','student-session','chosen_name')).rowcount==1\n`+
    `assert db.execute('SELECT username,is_temporary FROM account_usernames WHERE user_id=?',('student',)).fetchone()==('chosen_name',0)\n`+
    `assert db.execute('SELECT display_name FROM profiles WHERE user_id=?',('student',)).fetchone()[0]=='Original student'\n`+
    `assert db.execute(data['insert'],args('student','student-session','second_name')).rowcount==0\n`+
    `assert db.execute('SELECT COUNT(*) FROM app_users').fetchone()[0]==2\n`;
  const result = spawnSync("python3", ["-c", script], { input: JSON.stringify({ insert, migration }), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
