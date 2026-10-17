import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = path => readFileSync(join(process.cwd(), path), "utf8");

test("community realtime exposes connection, presence and bounded typing state", () => {
  const provider = read("lib/community/realtime-provider.ts");
  const chat = read("components/community/community-chat.tsx");
  const coordinator = read("community-coordinator.ts");
  assert.match(provider, /onConnectionChanged/);
  assert.match(provider, /navigator\.onLine/);
  assert.match(chat, /is typing/);
  assert.match(chat, /typingTimerRef/);
  assert.match(coordinator, /private readonly presence/);
  assert.match(coordinator, /this\.leave\(server\)/);
});

test("push subscriptions are authenticated, owner-bound and same-origin", () => {
  const route = read("app/api/push/subscriptions/route.ts");
  const migration = read("d1/migrations/0061_mobile_phase9_web_push.sql");
  assert.match(route, /optionalUser/);
  assert.match(route, /assertSameOriginMutation/);
  assert.match(route, /owner\.user_id !== user\.id/);
  assert.match(migration, /REFERENCES app_users\(user_id\) ON DELETE CASCADE/);
  assert.match(migration, /endpoint TEXT NOT NULL UNIQUE/);
});

test("push permission is user initiated and worker navigation is constrained", () => {
  const controls = read("components/planner/browser-push-controls.tsx");
  const worker = read("public/sw.js");
  assert.match(controls, /Notification\.requestPermission\(\)/);
  assert.match(controls, /onClick/);
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /rawHref\.startsWith\("\/"\)/);
  assert.match(worker, /addEventListener\("notificationclick"/);
});

test("mobile parity publishes community and push failure states", () => {
  const parity = read("config/mobile-feature-parity.ts");
  assert.match(parity, /id: "community"/);
  assert.match(parity, /Durable Object realtime/);
  assert.match(parity, /unsupported, blocked, unconfigured/);
});
