import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 3 keeps provider identity tied to one stable application owner", () => {
  const auth = read("lib/auth/cloudflare.ts");
  assert.match(auth, /email_verified=1 AND lower\(email\)=lower\(\?1\)/);
  assert.match(auth, /GROUP BY application_user_id LIMIT 2/);
  assert.match(auth, /matchedUsers\.length > 1/);
  assert.match(auth, /canonicalUser\?\.application_user_id/);
});

test("Phase 3 sessions are hashed, rotating, device-aware and remotely revocable", () => {
  const auth = read("lib/auth/cloudflare.ts");
  assert.match(auth, /sha256Base64Url\(rawToken\)/);
  assert.match(auth, /absoluteExpiresAt: row\.absolute_expires_at/);
  assert.match(auth, /listCloudflareSessions/);
  assert.match(auth, /revokeOtherCloudflareSessions/);
  assert.match(auth, /signOutAllCloudflareSessions/);
  const migration = read("d1/migrations/0059_mobile_phase3_session_devices.sql");
  assert.match(migration, /auth_session_events/);
  assert.match(migration, /append-only/);
});

test("Phase 3 remains compatible until the retained mobile session migration is applied", () => {
  const auth = read("lib/auth/cloudflare.ts");
  assert.match(auth, /isMobileSessionSchemaUnavailable/);
  assert.match(auth, /INSERT INTO sessions\(session_id,application_user_id,auth_identity_id,token_hash,remember_device,expires_at,absolute_expires_at,rotated_from_session_id\) VALUES/);
  assert.match(auth, /SELECT session_id,last_seen_at,expires_at,created_at FROM sessions/);
  assert.match(auth, /writeOptionalSessionEvent/);
});

test("Phase 3 exposes safe automatic rotation and device controls through v1", () => {
  const route = read("app/api/v1/session/route.ts");
  const runtime = read("components/auth/session-runtime.tsx");
  const controls = read("components/auth/session-controls.tsx");
  assert.match(route, /rotateRecommended/);
  assert.match(route, /assertSameOriginMutation/);
  assert.match(runtime, /10 \* 60 \* 1000/);
  assert.match(runtime, /action: "rotate"/);
  assert.match(controls, /revoke_others/);
  assert.match(controls, /revoke_all/);
});

test("Phase 3 mobile OAuth return is fixed and contains no credential", () => {
  const callback = read("app/auth/callback/route.ts");
  const auth = read("lib/auth/cloudflare.ts");
  assert.match(callback, /ca-progress:\/\/auth\/complete/);
  assert.match(callback, /searchParams\.set\("next", destination\)/);
  assert.doesNotMatch(callback, /searchParams\.set\("(?:token|session|user)/);
  assert.match(auth, /code_challenge_method", "S256"/);
  assert.match(auth, /clientKind: source\.searchParams\.get\("client"\)/);
});

test("Phase 3 preserves idempotent lossless guest migration and owner isolation", () => {
  const route = read("app/api/offline/guest-migration/route.ts");
  const runtime = read("components/offline/offline-runtime.tsx");
  assert.match(route, /UNIQUE\(guest_id,account_user_id\)|guest_account_migrations/);
  assert.match(route, /INSERT OR IGNORE INTO guest_account_migration_items/);
  assert.match(route, /needs_review/);
  assert.match(runtime, /clearOfflineOwner\(migration\.guestId\)/);
  assert.match(runtime, /identity\?\.userId !== context\.userId/);
});

test("Phase 3 migration is retained but production remains an explicit action", () => {
  const runner = read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(runner, /0059_mobile_phase3_session_devices\.sql/);
  assert.match(runner, /version IN \('0059','0060'\)/);
});
