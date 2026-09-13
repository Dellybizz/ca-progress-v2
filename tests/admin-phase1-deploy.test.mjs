import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function readJsonc(path) {
  const raw = read(path);
  return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
}

test("Phase 1 web deployment uses the retained ledger and includes immutable admin audit migration 0027", () => {
  const migrator = read("../scripts/apply-retained-d1-migrations.mjs");
  const migration = packageJson.scripts?.["cf:migrate:admin-phase1"] ?? "";
  const deployWeb = packageJson.scripts?.["cf:deploy:web"] ?? "";
  assert.match(migrator, /\["0027", "d1\/migrations\/0027_admin_phase1_security\.sql"\]/);
  assert.match(migrator, /_ca_schema_migrations/);
  assert.equal(migration, "npm run cf:migrate:retained");
  assert.ok(deployWeb.startsWith("npm run cf:migrate:retained && "), "web deployment must verify/apply retained D1 migrations before publishing the Worker");
  assert.doesNotMatch(deployWeb, /cf:migrate:admin-phase1/, "web deployment must not chain through the obsolete single-migration publish gate");
});

test("heavy private ICAI sync has the paid-Worker CPU budget required by the live queue proof", () => {
  const config = readJsonc("../workers/icai-sync/wrangler.jsonc");
  assert.equal(config.name, "ca-progress-v2-icai-sync");
  assert.equal(config.workers_dev, false, "ICAI sync must remain private behind its service binding");
  assert.equal(config.limits?.cpu_ms, 300000, "ICAI parsing/sync work must opt into the five-minute CPU ceiling instead of the 30-second default");
});
