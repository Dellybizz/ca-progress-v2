import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 6 advances offline compatibility without abandoning version 2 devices", () => {
  const release = read("config/app-release.ts");
  const database = read("lib/offline/database.ts");
  assert.match(release, /offline: Object\.freeze\(\{ current: 3, minimumSupported: 2 \}\)/);
  assert.match(database, /OFFLINE_SCHEMA_VERSION = 3/);
  assert.match(database, /Upgrade the recovered v1 draft without losing queued work or files/);
});

test("Phase 6 uses the shared versioned transport for offline replay", () => {
  const database = read("lib/offline/database.ts");
  const contract = read("lib/mobile/api-v1.ts");
  assert.match(database, /"\/api\/v1\/offline\/context"/);
  assert.match(database, /"\/api\/v1\/offline\/mutations"/);
  assert.match(database, /"X-CA-API-Version": "1"/);
  assert.match(contract, /"offline"/);
});

test("Phase 6 retains sanitized three-way conflict evidence", () => {
  const route = read("app/api/offline/mutations/route.ts");
  const database = read("lib/offline/database.ts");
  assert.match(route, /conflict: \{ expected, current, local \}/);
  assert.match(route, /This item changed on another device/);
  assert.match(database, /safeOfflineData\(payload\.conflict\)/);
  assert.match(database, /status: response\.status === 409 \? "conflict"/);
});

test("Phase 6 conflict choices are explicit and dependency safe", () => {
  const database = read("lib/offline/database.ts");
  const controls = read("components/offline/offline-controls.tsx");
  assert.match(database, /retryOfflineConflict/);
  assert.match(database, /expected: row\.conflict\.current, predecessor: null/);
  assert.match(database, /discardOfflineMutationChain/);
  assert.match(database, /discarded\.has\(predecessor\)/);
  assert.match(controls, /Compare versions/);
  assert.match(controls, /Apply my version/);
  assert.match(controls, /Use cloud version/);
  assert.match(controls, /Download edit/);
  assert.match(controls, /disabled=\{busy \|\| !state\.online\}/);
});

test("Phase 6 exposes pending and conflicted edits throughout the student shell", () => {
  const shell = read("components/shell/app-shell.tsx");
  const status = read("components/offline/offline-sync-status.tsx");
  assert.match(shell, /OfflineSyncStatus/);
  assert.match(status, /getPendingMutations/);
  assert.match(status, /offline-data-change/);
  assert.match(status, /edits? need/);
  assert.match(status, /href="\/offline"/);
});

test("Phase 6 requests background synchronization without moving credentials into the worker", () => {
  const database = read("lib/offline/database.ts");
  const runtime = read("components/offline/offline-runtime.tsx");
  const worker = read("public/sw.js");
  assert.match(database, /sync\?\.register\("ca-progress-offline-sync"\)/);
  assert.match(worker, /event\.tag !== "ca-progress-offline-sync"/);
  assert.match(worker, /type: "SYNC_OFFLINE_EDITS"/);
  assert.match(runtime, /event\.data\?\.type === "SYNC_OFFLINE_EDITS"/);
  assert.doesNotMatch(worker, /\/api\/v1\/offline\/mutations/);
});

test("Phase 6 preserves fail-closed ownership, context and queue ordering", () => {
  const database = read("lib/offline/database.ts");
  const route = read("app/api/offline/mutations/route.ts");
  assert.match(database, /active\?\.userId !== ownerId/);
  assert.match(database, /row\.contextKey !== current\.contextKey/);
  assert.match(database, /Preserve order: dependent edits must not pass/);
  assert.match(route, /input\.ownerId !== context\.userId/);
  assert.match(route, /input\.contextKey !== context\.contextKey/);
  assert.match(route, /offline_mutation_receipts/);
});
