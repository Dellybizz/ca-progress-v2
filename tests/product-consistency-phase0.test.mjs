import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { routeContracts, personaContracts } from "../config/product-consistency-route-contracts.mjs";

const root = new URL("../", import.meta.url).pathname;
function pages(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) pages(path, found);
    else if (entry.name === "page.tsx") found.push(relative(root, path).replaceAll("\\", "/"));
  }
  return found;
}

test("every student and admin page has one Phase 0 contract", () => {
  const actual = [...pages(join(root, "app/(student)")), ...pages(join(root, "app/(admin)"))].sort();
  assert.deepEqual(routeContracts.map((item) => item.page).sort(), actual);
  assert.equal(new Set(routeContracts.map((item) => item.route)).size, routeContracts.length);
});

test("route contracts name service, data, scope, access, offline and enforcement", () => {
  for (const contract of routeContracts) {
    assert.equal(existsSync(join(root, contract.page)), true, contract.page);
    assert.ok(contract.purpose.length > 4 && contract.service.startsWith("lib/") && contract.tables.length > 0, contract.route);
    assert.ok(["canonical", "partial"].includes(contract.enforcement), contract.route);
    if (contract.enforcement === "partial") assert.ok(contract.knownGap?.length > 20, contract.route);
  }
});

test("required academic boundary personas are explicit", () => {
  const ids = new Set(personaContracts.map((item) => item.id));
  for (const id of ["guest-unselected", "foundation-current", "intermediate-group-1", "intermediate-group-2", "intermediate-both", "final-group-1", "final-group-2", "admin-preview"]) assert.equal(ids.has(id), true, id);
});

test("integrity diagnostics are strictly read-only", () => {
  const sql = readFileSync(join(root, "scripts/product-consistency/phase0-integrity.sql"), "utf8");
  const executable = sql.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|VACUUM)\b/i);
  for (const finding of ["subject_group_level_mismatch", "attempt_scope_mismatch", "verified_icai_resource_without_scope", "approved_exam_without_start_date"]) assert.match(sql, new RegExp(finding));
});

test("backup workflow records a recoverable D1 checkpoint and never applies a migration", () => {
  const workflow = readFileSync(join(root, ".github/workflows/product-consistency-phase0-backup.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /wrangler d1 time-travel info/);
  assert.match(workflow, /grep -q 'bookmark'/);
  assert.doesNotMatch(workflow, /d1 migrations apply|d1 execute.*--file/);
});
