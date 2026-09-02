import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");
test("Phase 9 remains implemented while rollback defaults stay Phase 11 and staging deploy uses the Phase 5 cutover", () => { assert.match(read("wrangler.jsonc"), /NEXT_PUBLIC_APP_VERSION\": \"phase-11\"/); assert.match(read(".env.example"), /NEXT_PUBLIC_APP_VERSION=phase-11/); assert.match(read("lib/env.ts"), /\|\| \"phase-11\"/); assert.match(read(".github/workflows/deploy-staging.yml"), /NEXT_PUBLIC_APP_VERSION:\s*cloudflare-migration-phase-5/); assert.match(read("app/globals.css"), /phase9\.css/); });
test("Phase 9 source migration did not start Phase 10 Community or Phase 11 billing work", () => { const migration = read("supabase/migrations/20260830170000_phase9_smart_revision_planner.sql"); assert.match(migration, /revision_rules/); assert.match(migration, /daily_plans/); assert.match(migration, /forecast_snapshots/); assert.doesNotMatch(migration, /community_messages|community_channels|subscription_plans|payment_orders/); });
