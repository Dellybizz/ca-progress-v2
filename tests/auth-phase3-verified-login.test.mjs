import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public password endpoint only accepts login and never creates users", () => {
  const route = read("app/api/v1/password-auth/route.ts");
  const service = read("lib/auth/password.ts");
  assert.match(route, /input\.action !== "login"/);
  assert.doesNotMatch(service, /INSERT INTO app_users|INSERT INTO password_credentials|ensureCloudflareUserBootstrap/);
  assert.match(service, /userId = credential\.user_id/);
  assert.match(service, /issueSession\(\{ applicationUserId: userId/);
});

test("web and Android offer verified provider onboarding and username login", () => {
  const web = read("components/auth/login-panel.tsx");
  const mobile = read("apps/mobile/src/main.tsx");
  const transport = read("apps/mobile/src/native-auth.ts");
  for (const screen of [web, mobile]) {
    assert.match(screen, /Continue with Google/);
    assert.match(screen, /Continue with LinkedIn/);
    assert.doesNotMatch(screen, /Create username account|action: "register"/);
  }
  assert.match(transport, /action: "login", username, password/);
});
