import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
