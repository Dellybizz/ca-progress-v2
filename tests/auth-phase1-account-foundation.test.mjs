import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("username backfill preserves owners, linked records, and password aliases", () => {
  const migration = readFileSync(new URL("../d1/migrations/0069_auth_phase1_account_usernames.sql", import.meta.url), "utf8");
  const script = `import sqlite3,sys\n` +
    `db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')\n` +
    `db.executescript('CREATE TABLE app_users(user_id TEXT PRIMARY KEY);CREATE TABLE profiles(user_id TEXT PRIMARY KEY REFERENCES app_users(user_id),display_name TEXT);CREATE TABLE password_credentials(user_id TEXT PRIMARY KEY REFERENCES app_users(user_id),username TEXT UNIQUE COLLATE NOCASE);CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY,description TEXT,source_freeze_commit TEXT);')\n` +
    `db.executemany('INSERT INTO app_users VALUES(?)',[('oauth-owner',),('guest-owner',),('password-owner',)])\n` +
    `db.executemany('INSERT INTO profiles VALUES(?,?)',[('oauth-owner','Original student'),('guest-owner','Guest'),('password-owner','Password student')])\n` +
    `db.execute('INSERT INTO password_credentials VALUES(?,?)',('password-owner','chosen_name'))\n` +
    `db.executescript(sys.stdin.read())\n` +
    `rows=db.execute('SELECT u.user_id,n.username,n.is_temporary,p.display_name FROM app_users u JOIN account_usernames n USING(user_id) JOIN profiles p USING(user_id)').fetchall()\n` +
    `assert len(rows)==3 and len({r[1].lower() for r in rows})==3 and all(r[0] in ('oauth-owner','guest-owner','password-owner') for r in rows)\n` +
    `assert next(r for r in rows if r[0]=='password-owner')[1:3]==('chosen_name',0)\n` +
    `assert all(r[1].startswith('student_') and r[2]==1 for r in rows if r[0]!='password-owner')\n` +
    `db.execute('INSERT INTO app_users VALUES(?)',('new-owner',))\n` +
    `assert db.execute('SELECT count(*) FROM account_usernames').fetchone()[0]==4\n` +
    `db.execute('INSERT INTO password_credentials VALUES(?,?)',('new-owner','another_name'))\n` +
    `assert db.execute('SELECT username,is_temporary FROM account_usernames WHERE user_id=?',('new-owner',)).fetchone()==('another_name',0)\n` +
    `try: db.execute('INSERT INTO password_credentials VALUES(?,?)',('oauth-owner','CHOSEN_NAME'))\n` +
    `except sqlite3.IntegrityError: pass\n` +
    `else: raise AssertionError('username collision accepted')\n` +
    `assert db.execute('SELECT count(*) FROM profiles').fetchone()[0]==3\n` +
    `assert db.execute('PRAGMA foreign_key_check').fetchall()==[]\n`;
  const result = spawnSync("python3", ["-c", script], { input: migration, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
