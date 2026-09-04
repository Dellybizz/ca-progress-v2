import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("authenticated verification workflow supplies both sessions and remote D1 credentials", () => {
  const workflow = read(".github/workflows/phase1-authenticated-mutations.yml");
  assert.match(workflow, /SMOKE_MUTATION_AUTH_COOKIE: \$\{\{ secrets\.SMOKE_MUTATION_AUTH_COOKIE \}\}/);
  assert.match(workflow, /SMOKE_MODERATOR_AUTH_COOKIE: \$\{\{ secrets\.SMOKE_MODERATOR_AUTH_COOKIE \}\}/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow, /PHASE1_D1_DATABASE: ca-progress-v2-phase4-shadow/);
  assert.match(workflow, /if-no-files-found: error/);
});

test("foundation harness is strict, redacted, and checks remote identities", () => {
  const harness = read("scripts/phase5/authenticated-mutations.mjs");
  assert.match(harness, /\["passed", "failed", "unsupported"\]/);
  assert.match(harness, /check\.required && check\.status !== "passed"/);
  assert.match(harness, /wrangler", "d1", "execute"/);
  assert.match(harness, /"--remote"/);
  assert.match(harness, /SMOKE_MODERATOR_AUTH_COOKIE/);
  assert.match(harness, /PRIVILEGED_ROLES/);
  assert.match(harness, /report secret scan/);
  assert.doesNotMatch(harness, /moderatorCookie\s*=.*\|\|.*cookie/);
});
