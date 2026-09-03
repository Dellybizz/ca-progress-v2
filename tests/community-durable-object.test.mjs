import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Community uses a per-channel Durable Object coordinator for ephemeral state", () => {
  const coordinator = read("community-coordinator.ts");
  const config = read("wrangler.web.jsonc");
  const provider = read("lib/community/realtime-provider.ts");
  assert.match(coordinator, /class CommunityChannelCoordinator/);
  assert.match(coordinator, /getWebSockets/);
  assert.match(coordinator, /type: "presence"/);
  assert.match(coordinator, /type: "typing"/);
  assert.match(coordinator, /type: "refresh"/);
  assert.match(config, /COMMUNITY_COORDINATORS/);
  assert.match(config, /CommunityChannelCoordinator/);
  assert.match(provider, /new WebSocket/);
  assert.match(provider, /MAX_RECONNECT_MS/);
  assert.match(provider, /socket\.addEventListener\("close"/);
});

test("Community realtime is authorized before the Durable Object is reached", () => {
  const route = read("app/api/community/channels/[channel]/realtime/route.ts");
  assert.match(route, /getCommunityChannelAccess/);
  assert.match(route, /if \(!access\.allowed\)/);
  assert.match(route, /idFromName\(channel\)/);
  assert.match(route, /namespace\.get\(id\)\.fetch/);
});

test("Community chat keeps D1 pagination and broadcasts only refresh signals", () => {
  const messages = read("app/api/community/channels/[channel]/messages/route.ts");
  const chat = read("components/community/community-chat.tsx");
  assert.match(messages, /getCommunityMessagePage/);
  assert.match(messages, /Cache-Control.*private, no-store/);
  assert.match(chat, /channelSlug: model\.channel\.slug/);
  assert.match(chat, /type: "refresh", reason: "message"/);
  assert.match(chat, /type: "refresh", reason: "reaction"/);
  assert.match(chat, /nextCursor/);
  assert.match(chat, /loadOlder/);
});

test("Durable Object events cannot write messages or bypass moderation", () => {
  const coordinator = read("community-coordinator.ts");
  assert.doesNotMatch(coordinator, /INSERT INTO|UPDATE community_messages|DELETE FROM|moderation_status/);
  assert.match(read("lib/community/service.ts"), /getCommunityChannelAccess/);
  assert.match(read("supabase/migrations/20260830190000_phase10_community_v2.sql"), /phase10_moderate/);
});
