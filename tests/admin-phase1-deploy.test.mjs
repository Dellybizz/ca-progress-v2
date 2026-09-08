import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function readJsonc(path) {
  const raw = readFileSync(new URL(path, import.meta.url), "utf8");
  return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
}

test("Phase 1 web deployment applies the immutable admin audit migration before Worker rollout", () => {
  const migration = packageJson.scripts?.["cf:migrate:admin-phase1"] ?? "";
  const deployWeb = packageJson.scripts?.["cf:deploy:web"] ?? "";
  assert.match(migration, /0027_admin_phase1_security\.sql/);
  assert.match(migration, /wrangler d1 execute ca-progress-v2-phase4-shadow --remote/);
  assert.ok(deployWeb.startsWith("npm run cf:migrate:admin-phase1 && "), "web deployment must migrate D1 before publishing the Worker");
});

test("heavy private ICAI sync has the paid-Worker CPU budget required by the live queue proof", () => {
  const config = readJsonc("../workers/icai-sync/wrangler.jsonc");
  assert.equal(config.name, "ca-progress-v2-icai-sync");
  assert.equal(config.workers_dev, false, "ICAI sync must remain private behind its service binding");
  assert.equal(config.limits?.cpu_ms, 300000, "ICAI parsing/sync work must opt into the five-minute CPU ceiling instead of the 30-second default");
});
