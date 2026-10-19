import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pbkdf2Sync } from "node:crypto";
import { prepareTestAccount } from "../scripts/auth/create-test-account.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("manual test account uses the same ID, alias trigger and PBKDF2 login hash", () => {
  const password = "only-for-local-test-123";
  const account = prepareTestAccount({ username: "TeSt_Student", displayName: "Student's test", password });
  assert.doesNotMatch(account.sql, /only-for-local-test-123/);
  const script = `import sqlite3,json,sys\na=json.load(sys.stdin);d=sqlite3.connect(':memory:');d.executescript('CREATE TABLE app_users(user_id TEXT PRIMARY KEY,auth_provider TEXT,provider_subject TEXT,account_state TEXT,role TEXT);CREATE TABLE profiles(user_id TEXT PRIMARY KEY,display_name TEXT);CREATE TABLE user_preferences(user_id TEXT PRIMARY KEY);CREATE TABLE account_usernames(user_id TEXT PRIMARY KEY,username TEXT UNIQUE COLLATE NOCASE,is_temporary INTEGER,changed_at TEXT);CREATE TABLE password_credentials(user_id TEXT PRIMARY KEY,username TEXT UNIQUE COLLATE NOCASE,salt TEXT,password_hash TEXT,iterations INTEGER);CREATE TRIGGER alias_new AFTER INSERT ON app_users BEGIN INSERT INTO account_usernames(user_id,username,is_temporary) VALUES(new.user_id,"student_"||lower(hex(randomblob(8))),1); END;CREATE TRIGGER credential_new AFTER INSERT ON password_credentials BEGIN UPDATE account_usernames SET username=new.username,is_temporary=0 WHERE user_id=new.user_id; END;');d.executescript(a['sql']);row=d.execute('SELECT u.user_id,u.auth_provider,p.display_name,n.username,n.is_temporary,pc.salt,pc.password_hash,pc.iterations FROM app_users u JOIN profiles p USING(user_id) JOIN account_usernames n USING(user_id) JOIN password_credentials pc USING(user_id)').fetchone();print(json.dumps(row))`;
  const run = spawnSync("python3", ["-c", script], { encoding: "utf8", input: JSON.stringify(account) });
  assert.equal(run.status, 0, run.stderr);
  const [userId, provider, displayName, username, temporary, salt, hash, iterations] = JSON.parse(run.stdout);
  assert.equal(userId, account.userId); assert.equal(provider, "manual-test"); assert.equal(displayName, "Student's test");
  assert.equal(username, "test_student"); assert.equal(temporary, 0); assert.equal(iterations, 310000);
  assert.equal(hash, pbkdf2Sync(password, Buffer.from(salt, "hex"), iterations, 32, "sha256").toString("hex"));
});

test("Android backup excludes keystore ciphertext for both backup formats and corrupt restore recovers to sign-in", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const oldRules = read("android/app/src/main/res/xml/backup_rules.xml");
  const newRules = read("android/app/src/main/res/xml/data_extraction_rules.xml");
  const plugin = read("packages/capacitor-secure-session/android/src/main/java/in/zanisheluxe/caprogress/securesession/SecureSessionPlugin.java");
  assert.match(manifest, /android:fullBackupContent="@xml\/backup_rules"/);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  assert.match(oldRules, /exclude domain="sharedpref" path="ca_progress_secure_session.xml"/);
  assert.equal(newRules.match(/exclude domain="sharedpref" path="ca_progress_secure_session.xml"/g)?.length, 2);
  assert.match(plugin, /catch \(Exception error\) \{ preferences\(\)\.edit\(\)\.remove\(storageKey\)\.apply\(\); result\.put\("value", JSObject\.NULL\); call\.resolve\(result\); \}/);
});
