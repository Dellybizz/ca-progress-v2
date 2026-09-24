import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("native auth uses one-use device PKCE and hash-only D1 records", async () => {
  const [migration, auth] = await Promise.all([read("d1/migrations/0064_mobile_phase15_native_auth.sql"), read("lib/auth/cloudflare.ts")]);
  assert.match(migration, /exchange_code_hash TEXT UNIQUE/);
  assert.match(migration, /REFERENCES app_users/);
  assert.match(auth, /providedChallenge/);
  assert.match(auth, /consumed_at IS NULL/);
  assert.match(auth, /setCookie: false/);
  assert.doesNotMatch(migration, /access_token|raw_token/i);
});

test("native client keeps bearer and PKCE proof in platform secure storage", async () => {
  const [client, android, ios] = await Promise.all([read("apps/mobile/src/native-auth.ts"), read("packages/capacitor-secure-session/android/src/main/java/in/zanisheluxe/caprogress/securesession/SecureSessionPlugin.java"), read("packages/capacitor-secure-session/ios/Sources/SecureSessionPlugin/SecureSessionPlugin.swift")]);
  assert.match(client, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(client, /Authorization: `Bearer/);
  assert.match(client, /const API_ORIGIN = "https:\/\/ca-progress-v2\.habeebaasif622\.workers\.dev";/);
  assert.doesNotMatch(client, /const API_ORIGIN = "https:\/\/caprogress\.zanisheluxe\.in";/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|console\./);
  assert.match(android, /AndroidKeyStore/);
  assert.match(android, /AES\/GCM\/NoPadding/);
  assert.match(ios, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
});

test("verified callback routes and device revocation are wired", async () => {
  const [manifest, plist, runtime, session] = await Promise.all([read("android/app/src/main/AndroidManifest.xml"), read("ios/App/App/Info.plist"), read("apps/mobile/src/runtime.ts"), read("app/api/v1/session/route.ts")]);
  assert.match(manifest, /android:scheme="ca-progress"/);
  assert.match(manifest, /android:host="auth" android:pathPrefix="\/complete"/);
  assert.match(plist, /<string>ca-progress<\/string>/);
  assert.match(runtime, /ca-progress:\/\/auth\/complete/);
  assert.match(runtime, /App\.addListener\("appUrlOpen"/);
  assert.match(runtime, /App\.getLaunchUrl\(\)/);
  assert.match(runtime, /handledAuthCallbacks = new Set<string>\(\)/);
  assert.match(runtime, /handledAuthCallbacks\.has\(url\)/);
  assert.match(session, /revoke_others/);
});
