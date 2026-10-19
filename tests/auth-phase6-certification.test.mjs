import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pbkdf2Sync } from "node:crypto";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { test } from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("live certification uses a unique fixture and never deletes or exports its credentials", () => {
  const script = read("scripts/auth/certify-phase6-live.mjs");
  const workflow = read(".github/workflows/auth-phase6-certification.yml");
  assert.match(script, /cert_\$\{randomBytes\(6\)/);
  assert.match(script, /auth_provider='manual-test'/);
  assert.match(script, /account_state='disabled'/);
  assert.match(script, /PRAGMA foreign_key_check/);
  assert.doesNotMatch(script, /DELETE FROM app_users|TRIGGER.*DROP|password:\s*password\s*[,}]/);
  assert.match(workflow, /needs: \[release, live-certification\]/);
  assert.match(workflow, /if: always\(\)/);
});

test("password verification retains the stored 310,000-round format on Workers", () => {
  const password = read("lib/auth/password.ts");
  const schema = read("d1/migrations/0068_username_password_accounts.sql");
  assert.match(password, /const ITERATIONS = 310000/);
  assert.match(schema, /iterations >= 310000/);
  assert.match(password, /pbkdf2\(sha256, encoder.encode\(password\), salt, \{ c: iterations, dkLen: 32 \}\)/);
  assert.doesNotMatch(password, /crypto\.subtle\.deriveBits/);
  const salt = new Uint8Array(16);
  const secret = new TextEncoder().encode("phase-six-credential-check");
  assert.equal(Buffer.from(pbkdf2(sha256, secret, salt, { c: 310000, dkLen: 32 })).toString("hex"), pbkdf2Sync(secret, salt, 310000, 32, "sha256").toString("hex"));
});
