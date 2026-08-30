import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url).pathname; const read=(p)=>readFileSync(join(root,p),"utf8");
test("Phase 10 remains implemented after the V2 staging label advances to Phase 12",()=>{assert.match(read("wrangler.jsonc"),/NEXT_PUBLIC_APP_VERSION\": \"phase-12\"/);assert.match(read(".env.example"),/NEXT_PUBLIC_APP_VERSION=phase-12/);assert.match(read("lib/env.ts"),/\|\| \"phase-12\"/);assert.match(read(".github/workflows/deploy-staging.yml"),/NEXT_PUBLIC_APP_VERSION:\s*phase-12/);assert.match(read("app/globals.css"),/phase10\.css/);});
test("Phase 10 source migration itself did not start Phase 11 billing",()=>{const sql=read("supabase/migrations/20260830190000_phase10_community_v2.sql");assert.match(sql,/community_channels/);assert.match(sql,/community_messages/);assert.match(sql,/moderation_actions/);assert.doesNotMatch(sql,/razorpay|payment_orders|subscription_plans|plan_entitlements/);});
