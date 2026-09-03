import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

test("Cloudflare auth has one cached request-scoped session context", () => {
  const cloudflare = read("lib/auth/cloudflare.ts");
  assert.match(cloudflare, /export const getCloudflareApplicationSession = cache\(readCloudflareApplicationSession\)/);
  assert.match(cloudflare, /export const getCloudflareRequestAuth = cache\(async/);
  assert.match(cloudflare, /s\.token_hash=\?1/);
  assert.match(cloudflare, /s\.revoked_at IS NULL/);
  assert.match(cloudflare, /s\.expires_at > CURRENT_TIMESTAMP/);
  assert.match(cloudflare, /s\.absolute_expires_at > CURRENT_TIMESTAMP/);
});

test("identity, authorization, and D1 compatibility consume the shared context", () => {
  const provider = read("lib/auth/provider.ts");
  const server = read("lib/auth/server.ts");
  const authorization = read("lib/authorization/server.ts");
  const d1 = read("lib/data/d1/supabase-compat.ts");
  assert.match(provider, /getCloudflareRequestAuth/);
  assert.doesNotMatch(provider, /getCloudflareApplicationSession/);
  assert.match(server, /export const getRequestAuthContext = cache/);
  assert.match(server, /getCloudflareRequestAuth/);
  assert.match(authorization, /getRequestAuthContext/);
  assert.match(d1, /getCloudflareRequestAuth/);
  assert.doesNotMatch(d1, /getCloudflareApplicationSession/);
});

test("personalized loaders obtain identity from the request context", () => {
  for (const file of ["lib/dashboard/service.ts", "lib/planner/service.ts", "lib/community/service.ts"]) {
    assert.match(read(file), /getRequestAuthContext/);
    assert.doesNotMatch(read(file), /optionalUser/);
  }
});

test("public entry points do not perform personalized auth work", () => {
  for (const file of ["app/page.tsx", "app/(public)/login/page.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /optionalUser|getRequestAuthContext|getCloudflareApplicationSession|createD1ServerCompatClient/);
  }
});
