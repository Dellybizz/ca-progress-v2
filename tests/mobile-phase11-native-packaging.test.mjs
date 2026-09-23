import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const read = path => readFileSync(join(process.cwd(), path), "utf8");

test("Capacitor packages both platforms against the shared HTTPS production origin", () => {
  const config = read("capacitor.config.ts");
  assert.match(config, /appId: "in\.zanisheluxe\.caprogress"/);
  assert.match(config, /https:\/\/caprogress\.zanisheluxe\.in/);
  assert.match(config, /cleartext: false/);
  assert.match(config, /CAProgressNative\/\$\{platform\}\/1/);
  for (const path of ["android/app/build.gradle", "ios/App/App.xcodeproj/project.pbxproj"]) assert.ok(existsSync(join(process.cwd(), path)));
});

test("native lifecycle and deep links are origin and path allowlisted", () => {
  const runtime = read("components/mobile/native-runtime.tsx");
  assert.match(runtime, /APP_ORIGINS/);
  assert.match(runtime, /SAFE_PATH/);
  assert.match(runtime, /appUrlOpen/);
  assert.match(runtime, /backButton/);
  assert.match(runtime, /App\.minimizeApp/);
  assert.match(read("android/app/src/main/AndroidManifest.xml"), /android:autoVerify="true"/);
  assert.match(read("ios/App/App/App.entitlements"), /applinks:caprogress\.zanisheluxe\.in/);
});

test("association endpoints fail closed until signing identifiers exist", () => {
  const apple = read("app/.well-known/apple-app-site-association/route.ts");
  const android = read("app/.well-known/assetlinks.json/route.ts");
  assert.match(apple, /APPLE_TEAM_ID/);
  assert.match(android, /ANDROID_SHA256_CERT_FINGERPRINT/);
  assert.match(apple, /status: 503/);
  assert.match(android, /status: 503/);
});

test("first native build requests no sensitive device permission", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android\.permission\.INTERNET/);
  for (const permission of ["CAMERA", "RECORD_AUDIO", "ACCESS_FINE_LOCATION", "READ_CONTACTS", "READ_MEDIA_IMAGES"])
    assert.doesNotMatch(manifest, new RegExp(`android\\.permission\\.${permission}`));
});

test("account deletion is reachable, owner-bound and reversible before processing", () => {
  const migration = read("d1/migrations/0062_mobile_phase11_account_deletion.sql");
  const route = read("app/api/account-deletion/route.ts");
  const nav = read("components/shell/navigation-contract.ts");
  assert.match(migration, /REFERENCES app_users\(user_id\) ON DELETE CASCADE/);
  assert.match(migration, /WHERE status IN \('scheduled','processing'\)/);
  assert.match(route, /DELETE MY ACCOUNT/);
  assert.match(route, /user_id=\?1/);
  assert.match(route, /status='cancelled'/);
  assert.match(nav, /href: "\/account-deletion"/);
});

test("store submission records preserve honest blockers", () => {
  const apple = read("docs/mobile/store/APP_STORE_SUBMISSION.md");
  const google = read("docs/mobile/store/PLAY_STORE_SUBMISSION.md");
  assert.match(apple, /Purchases: disabled/);
  assert.match(apple, /macOS and Xcode/);
  assert.match(google, /Purchases: disabled/);
  assert.match(google, /internal testing/);
});
