import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("product Phase 0 keeps the Cloudflare-only runtime boundary", () => {
  const wrangler = read("wrangler.jsonc");
  const verifier = read("scripts/verify-supabase-retired.mjs");
  assert.match(wrangler, /"binding": "DB"/);
  assert.match(wrangler, /"USER_RESOURCES_R2"/);
  assert.match(wrangler, /"ICAI_SYNC_SERVICE"/);
  assert.match(wrangler, /"BILLING_SERVICE"/);
  assert.match(wrangler, /"BACKGROUND_JOBS"/);
  assert.match(verifier, /supabase/i);
});

test("canonical academic IDs already cover course through subtopic and accounting standards", () => {
  const migration = read("d1/migrations/0002_phase2_billing_mentor_catalog.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS academic_catalog_nodes/);
  assert.match(migration, /canonical_id TEXT PRIMARY KEY/);
  for (const kind of ["course", "group", "subject", "chapter", "unit", "accounting_standard", "subtopic"]) {
    assert.match(migration, new RegExp(`'${kind}'`));
  }
  assert.match(migration, /academic_catalog_lineage/);
  assert.match(migration, /academic_catalog_aliases/);
});

test("private user data and academic mutations remain server scoped", () => {
  const client = read("lib/data/d1/client.ts");
  const privacy = read("lib/product/privacy.ts");
  assert.match(client, /const OWNER_COLUMN/);
  assert.match(client, /notes: "user_id"/);
  assert.match(client, /uploaded_resources: "owner_user_id"/);
  assert.match(client, /async function chapterApplicable/);
  assert.match(client, /async function subjectApplicable/);
  assert.match(client, /Chapter is not applicable to the current academic profile/);
  assert.match(privacy, /DEFAULT_USER_CONTENT_VISIBILITY[^\n]*= "private"/);
  assert.match(privacy, /if \(context\.visibility === "private"\) return false/);
  assert.match(privacy, /context\.isAcceptedBuddy/);
  assert.match(privacy, /context\.isAuthorizedModerator/);
});

test("billing and resource quotas remain server-enforced", () => {
  const billing = read("lib/billing/service.ts");
  assert.match(billing, /export async function getEntitlementForUser/);
  assert.match(billing, /export async function getResourceStorageAccess/);
  assert.match(billing, /access\.usedBytes \+ input\.sizeBytes > access\.limitBytes/);
  assert.match(billing, /createResourceMetadataWithinQuota/);
});

test("autofetch contracts separate content identity from URL location", () => {
  const contracts = read("lib/autofetch/contracts.ts");
  const migration = read("d1/migrations/0012_product_phase0_autofetch_contracts.sql");
  for (const table of [
    "autofetch_content_targets",
    "autofetch_source_registry",
    "autofetch_source_locations",
    "autofetch_discovery_candidates",
    "autofetch_resource_records",
    "autofetch_resource_locations",
    "autofetch_resource_versions",
  ]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));

  assert.match(contracts, /URL is deliberately excluded/);
  assert.match(contracts, /canonicalResourceIdentityMaterial/);
  const identityBody = contracts.match(/export function canonicalResourceIdentityMaterial[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.doesNotMatch(identityBody, /officialUrl|sourcePageUrl|directFileUrl/);
  assert.match(contracts, /"redirect"[\s\S]*"parent_index"[\s\S]*"sitemap"[\s\S]*"official_search"[\s\S]*"external_search"/);
  assert.match(migration, /source_page_url TEXT/);
  assert.match(migration, /direct_file_url TEXT/);
  assert.match(migration, /status='previous'/);
});

test("existing ICAI sync keeps last-known-good data and holds high-impact date changes for review", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  const d1 = read("workers/icai-sync/d1-client.ts");
  assert.match(engine, /If-None-Match/);
  assert.match(engine, /If-Modified-Since/);
  assert.match(engine, /Parser returned zero academic items\. Last verified data was preserved for review\./);
  assert.match(d1, /risk:"high",decision:"pending_review",applied:false/);
  assert.match(d1, /Canonical dates remain unchanged until review/);
});

test("stable resource open endpoint prefers the verified direct document and never proxies it", () => {
  const route = read("app/(student)/resources/[id]/open/route.ts");
  assert.match(route, /autofetch_resource_records/);
  assert.match(route, /a\.canonical_resource_id=\?1 OR r\.id=\?1/);
  assert.match(route, /a\.is_current=1/);
  assert.match(route, /r\.verification_status='verified'/);
  assert.match(route, /row\.direct_file_url \|\| row\.official_url/);
  assert.match(route, /isApprovedIcaiUrl\(destination\)/);
  assert.match(route, /status: 307/);
  assert.match(route, /Location: destination/);
  assert.match(route, /Cache-Control": "no-store, max-age=0/);
  assert.doesNotMatch(route, /await fetch\(destination/);
});

test("deployment applies the retained D1 migration chain before Worker rollout", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  assert.match(workflow, /- d1\/\*\*/);
  assert.match(workflow, /Apply retained D1 migrations/);
  assert.match(workflow, /wrangler d1 migrations apply ca-progress-v2-phase4-shadow --remote --config=wrangler\.jsonc/);
  assert.match(workflow, /autofetch_content_targets/);
  assert.match(workflow, /PRAGMA foreign_key_check/);
});

test("CA Mentor remains a separate implementation boundary", () => {
  const mentorPlan = read("CA_MENTOR_REVISED_IMPLEMENTATION_PLAN.md");
  const productContracts = read("lib/autofetch/contracts.ts");
  const privacy = read("lib/product/privacy.ts");
  assert.ok(mentorPlan.length > 1000);
  assert.doesNotMatch(productContracts, /from ["']@\/lib\/mentor|from ["']\.\.\/mentor/);
  assert.doesNotMatch(privacy, /from ["']@\/lib\/mentor|from ["']\.\.\/mentor/);
});
