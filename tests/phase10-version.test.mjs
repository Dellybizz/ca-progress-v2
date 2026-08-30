import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(p)=>readFileSync(join(root,p),"utf8");
test("Phase 10 is the current V2 staging label",()=>{assert.match(read("wrangler.jsonc"),/NEXT_PUBLIC_APP_VERSION\": \"phase-10\"/);assert.match(read(".env.example"),/NEXT_PUBLIC_APP_VERSION=phase-10/);assert.match(read("lib/env.ts"),/\|\| \"phase-10\"/);assert.match(read(".github/workflows/deploy-staging.yml"),/NEXT_PUBLIC_APP_VERSION:\s*phase-10/);});
test("Phase 10 owns Community without starting Phase 11 billing",()=>{const sql=read("supabase/migrations/20260830190000_phase10_community_v2.sql");assert.match(sql,/community_channels/);assert.match(sql,/community_messages/);assert.match(sql,/moderation_actions/);assert.doesNotMatch(sql,/razorpay|subscription_entitlements|billing_transactions|payment_orders/);});
