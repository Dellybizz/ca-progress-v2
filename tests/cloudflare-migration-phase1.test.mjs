import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const audit = read("docs/cloudflare-migration/PHASE_1_AUDIT_AND_FREEZE.md");
const contract = read("lib/data/migration-contract.ts");

test("Cloudflare migration Phase 1 freeze records Supabase active and D1 not activated at the Phase 1 baseline", () => {
  assert.match(audit, /Production persistence:\s*Supabase/);
  assert.match(audit, /Production authentication:\s*Supabase Auth/);
  assert.match(audit, /Target persistence:\s*Cloudflare D1/);
  assert.match(audit, /### Not activated in Phase 1/);
  assert.match(audit, /No D1 database binding/);
  assert.match(audit, /No D1 migrations/);
  assert.match(contract, /targetPersistence: "cloudflare-d1"/);
  assert.match(contract, /mentorPhase3Started: false/);
});

test("Phase 1 inventory names every Supabase migration present at the freeze point", () => {
  const migrations = readdirSync(join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
  assert.ok(migrations.length >= 33, `expected at least 33 migrations, found ${migrations.length}`);
  for (const migration of migrations) assert.ok(audit.includes(`\`${migration}\``), `missing migration inventory entry: ${migration}`);
});

test("Phase 1 audit covers all required data domains", () => {
  for (const domain of ["Authentication", "Authorization", "Profiles/onboarding", "Academic catalog", "Progress", "Planner", "Study", "Resources/notes", "Community", "Billing", "ICAI", "Mentor 1", "Mentor 2"]) {
    assert.ok(audit.includes(domain), `missing audit domain: ${domain}`);
  }
});

test("Mentor Phase 2 canonical academic identity is explicitly frozen", () => {
  for (const identity of ["course:<levelId>", "group:<groupId>", "subject:<subjectId>", "chapter:<subjectId>:<chapterStableKey>", "topic:<subjectId>:<chapterStableKey>:<topicStableKey>"]) {
    assert.ok(audit.includes(identity), `missing canonical identity: ${identity}`);
  }
  assert.match(audit, /Mentor Phase 3: \*\*not started\*\*/i);
});

test("PostgreSQL to D1 map covers migration-critical semantics", () => {
  for (const term of ["RLS", "auth.uid()", "security definer", "PL/pgSQL RPC", "FOR UPDATE", "gen_random_uuid()", "jsonb", "PostgreSQL arrays", "GIN", "foreign keys", "ON CONFLICT", "PostgREST", "Supabase Realtime", "Supabase Storage"]) {
    assert.ok(audit.includes(term), `compatibility map missing: ${term}`);
  }
});

test("authorization matrix includes users, privileged roles, subscriptions and service-only actors", () => {
  for (const actor of ["Anonymous", "Authenticated student", "Resource owner", "Moderator", "Admin", "Owner / parent_owner", "Subscriber", "Billing Worker", "ICAI Worker", "Service role"]) {
    assert.ok(audit.includes(actor), `authorization matrix missing: ${actor}`);
  }
});

test("current Cloudflare bindings remain documented through the rollback-safe Phase 4 contract", () => {
  for (const binding of ["USER_RESOURCES_R2", "ICAI_SYNC_SERVICE", "BILLING_SERVICE", "30 0 * * *", "phase_4_shadow_migration_not_production_cutover", "phase_3_ready_not_production_activated", "optional_transition_only_not_final_data_layer"]) {
    assert.ok(contract.includes(binding), `runtime contract missing: ${binding}`);
  }
});

test("feature routes and Community UI use provider-neutral migration boundaries", () => {
  const featureFiles = [
    "app/auth/google/route.ts",
    "app/auth/linkedin/route.ts",
    "app/auth/callback/route.ts",
    "app/auth/signout/route.ts",
    "app/api/profile/route.ts",
    "app/api/onboarding/route.ts",
    "app/api/profile/avatar/route.ts",
    "components/community/community-chat.tsx",
  ];
  for (const path of featureFiles) assert.doesNotMatch(read(path), /@\/lib\/supabase\//, `${path} still creates a Supabase dependency directly`);
  assert.match(read("lib/auth/provider.ts"), /createServerSupabaseClient/);
  assert.match(read("lib/profile/service.ts"), /createServerSupabaseClient/);
  const realtime = read("lib/community/realtime-provider.ts");
  assert.match(realtime, /subscribeToCommunityRealtime/);
  assert.match(realtime, /window\.setInterval/);
  assert.doesNotMatch(realtime, /createBrowserSupabaseClient|@\/lib\/supabase\//);
});
