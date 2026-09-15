import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/deploy-staging.yml", import.meta.url), "utf8");

test("the deployment branch can deploy from GitHub App PR synchronization", () => {
  assert.match(workflow, /pull_request:[\s\S]*types: \[opened, synchronize, reopened\]/);
  assert.match(workflow, /github\.head_ref == 'phase-12-operations-admin-platform'/);
  assert.match(workflow, /head\.repo\.full_name == github\.repository/);
});

test("the current live hotfix branch runs CI and deploys every accepted commit", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const deploy = readFileSync(new URL("../.github/workflows/deploy-staging.yml", import.meta.url), "utf8");
  assert.match(ci, /branches: \[main, phase-12-operations-admin-platform, hotfix\/dark-mode-ae0cb36d\]/);
  assert.match(deploy, /branches: \[phase-12-operations-admin-platform, hotfix\/dark-mode-ae0cb36d\]/);
  assert.match(deploy, /github\.sha/);
});

test("PR deployment checks out the exact branch head and never the synthetic merge commit", () => {
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.doesNotMatch(workflow, /refs\/pull\/.*\/merge/);
});

test("duplicate push and PR events cannot run production deployment concurrently", () => {
  assert.match(workflow, /group: cloudflare-v2-deploy-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
});
