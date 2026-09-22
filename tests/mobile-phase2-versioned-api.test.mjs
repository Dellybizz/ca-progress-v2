import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 2 exposes an additive v1 namespace without shadowing physical handlers", () => {
  const config = read("next.config.ts");
  assert.match(config, /fallback:\s*\[\{ source: "\/api\/v1\/:path\*", destination: "\/api\/:path\*" \}\]/);
  assert.match(config, /Physical v1 handlers/);
});

test("Phase 2 centralizes version, trace, validation and mutation idempotency", () => {
  const boundary = read("lib/auth/proxy.ts");
  assert.match(boundary, /API_VERSION_UNSUPPORTED/);
  assert.match(boundary, /MAX_API_BODY_BYTES/);
  assert.match(boundary, /idempotency-key/);
  assert.match(boundary, /x-request-id/);
});

test("Phase 2 publishes every required student API domain", () => {
  const contract = read("lib/mobile/api-v1.ts");
  for (const domain of ["session", "dashboard", "progress", "chapters", "today", "planner", "focus", "notes", "resources", "community", "icai", "search", "profile", "settings", "notifications", "subscriptions"]) {
    assert.match(contract, new RegExp(`"${domain}"`));
  }
  assert.match(contract, /nextCursor/);
  assert.match(contract, /syncCursor/);
});

test("Phase 2 moves student website consumers onto the mobile API namespace", () => {
  for (const path of ["components/dashboard/dashboard-interactions.tsx", "components/progress/progress-tracker.tsx", "components/chapter-hub/chapter-hub.tsx", "components/planner/today-plan-client.tsx", "components/community/community-chat.tsx", "components/resources/resource-library.tsx", "components/billing/pricing-client.tsx"]) {
    assert.match(read(path), /\/api\/v1\//, path);
  }
});

test("Phase 2 retains Worker rate limits and emits structured v1 operational logs", () => {
  const worker = read("custom-worker.ts");
  assert.match(worker, /READ_API_RATE_LIMIT = 300/);
  assert.match(worker, /WRITE_API_RATE_LIMIT = 60/);
  assert.match(worker, /event: "api\.v1\.request"/);
});
