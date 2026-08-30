import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("moderator mutations are privileged and every successful action writes an audit row", () => {
  const sql = read("supabase/migrations/20260830190000_phase10_community_v2.sql");
  assert.match(sql, /phase10_moderate/);
  assert.match(sql, /v_role\s+not\s+in\s*\('moderator','admin','owner','parent_owner'\)/);
  assert.match(sql, /insert into public\.moderation_actions/);
  assert.match(sql, /returning id into v_action_id/);
  assert.match(sql, /action_type text not null check \(action_type in \('delete_message','restore_message','pin','unpin','block','unblock','dismiss_report','resolve_report'\)\)/);
});

test("attachments can reference only approved Phase 7 shared uploads", () => {
  const sql = read("supabase/migrations/20260830190000_phase10_community_v2.sql");
  const chat = read("components/community/community-chat.tsx");
  assert.match(sql, /attached_resource_id uuid references public\.uploaded_resources/);
  assert.match(sql, /u\.visibility='shared' and u\.moderation_status='approved'/);
  assert.match(sql, /Only approved shared resources can be attached/);
  assert.match(chat, /approved community resource/);
  assert.doesNotMatch(chat, /type=["']file["']/);
});

test("Realtime subscribes only to the active channel and is cleaned up on navigation", () => {
  const chat = read("components/community/community-chat.tsx");
  assert.match(chat, /const filter = `channel_id=eq\.\$\{model\.channel\.id\}`/);
  assert.match(chat, /\.channel\(`community:\$\{model\.channel\.id\}`\)/);
  assert.match(chat, /table: "community_messages", filter/);
  assert.match(chat, /table: "message_reactions", filter/);
  assert.match(chat, /table: "pinned_messages", filter/);
  assert.match(chat, /supabase\.removeChannel\(channel\)/);
});

test("mobile Community chat owns the dynamic viewport and contains scrolling without horizontal overflow", () => {
  const css = read("app/styles/phase10.css");
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /height:calc\(100dvh/);
  assert.match(css, /min-height:0/);
  assert.match(css, /overflow:hidden/);
  assert.match(css, /phase10-message-scroll[\s\S]*overflow-y:auto/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /max-width:100%/);
});

test("Community product routes and moderation route have loading and error boundaries", () => {
  for (const path of [
    "app/(student)/community/loading.tsx",
    "app/(student)/community/error.tsx",
    "app/(student)/community/[channel]/loading.tsx",
    "app/(student)/community/[channel]/error.tsx",
    "app/(admin)/admin/community/moderation/loading.tsx",
    "app/(admin)/admin/community/moderation/error.tsx",
  ]) assert.ok(read(path).length > 0, path);
});
