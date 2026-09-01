import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const audit = read("docs/cloudflare-migration/PHASE_1_AUDIT_AND_FREEZE.md");
const contract = read("lib/data/migration-contract.ts");

test("Cloudflare migration Phase 1 keeps Supabase active and does not activate D1", () => {
  assert.match(contract, /activePersistence: "supabase"/);
  assert.match(contract, /targetPersistence: "cloudflare-d1"/);
  assert.match(contract, /productionDataMigrated: false/);
  assert.match(contract, /authenticationReplaced: false/);
  assert.match(contract, /d1ProductionActivated: false/);
  assert.match(contract, /mentorPhase3Started: false/);
  assert.equal(existsSync(join(root, "d1", "migrations")), false);
  assert.doesNotMatch(read("wrangler.web.jsonc"), /"d1_databases"/);
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

test("current Cloudflare bindings are documented without inventing optional infrastructure", () => {
  for (const binding of ["USER_RESOURCES_R2", "ICAI_SYNC_SERVICE", "BILLING_SERVICE", "30 0 * * *", "phase_2_not_activated", "optional_transition_only_not_final_data_layer"]) {
    assert.ok(contract.includes(binding), `runtime contract missing: ${binding}`);
  }
});

test("feature routes and Community UI use provider-neutral Phase 1 boundaries", () => {
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
  assert.match(read("lib/community/realtime-provider.ts"), /createBrowserSupabaseClient/);
});
