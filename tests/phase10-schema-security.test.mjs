import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(p)=>readFileSync(join(root,p),"utf8"); const sql=()=>read("supabase/migrations/20260830190000_phase10_community_v2.sql");
test("Phase 10 creates normalized community and moderation objects with RLS",()=>{const s=sql();for(const table of ["community_channels","community_messages","message_reactions","channel_read_state","pinned_messages","moderation_actions","chat_blocks","message_reports","community_notifications"]){assert.match(s,new RegExp(`create table public\\.${table}`));assert.match(s,new RegExp(`alter table public\\.${table} enable row level security`));}});
test("authenticated clients are read-only at table level and writes use guarded RPCs",()=>{const s=sql();assert.match(s,/revoke insert,update,delete,truncate,references,trigger[\s\S]*from authenticated/);assert.match(s,/grant select[\s\S]*to authenticated/);assert.match(s,/phase10_can_write_channel/);assert.match(s,/raise exception 'You cannot write to this channel.'/);assert.match(s,/write_policy='members' or public\.phase10_is_moderator/);});
test("announcement channels are moderator-write and subject visibility is level/group scoped",()=>{const s=sql();assert.match(s,/\('announcements','Announcements'[\s\S]*'moderators'/);assert.match(s,/v_profile\.ca_level<>v_level_code/);assert.match(s,/v_profile\.group_choice='both' or v_profile\.group_choice=v_group_code/);});
