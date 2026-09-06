# CA Progress Revised Product Plan — Phase 0 Status

**Status:** COMPLETE — 6 September 2026 (Asia/Kolkata)

**Phase:** Architecture, canonical IDs and product boundaries

**Validated implementation head:** `893ff6030d5f2d21e1ce3fe8e9fd06d9a8ebcd87`

## Scope

Phase 0 locked the post-Supabase Cloudflare architecture and added the durable contracts required by the revised CA Progress product roadmap. It deliberately did not start the Chapter Hub work from Product Phase 1 or CA Mentor Phase 3.

## Reused verified baseline

The existing repository already satisfied substantial parts of the revised Phase 0 definition of done:

- Cloudflare-only auth/session runtime.
- D1-only application database runtime.
- R2-only user resource/avatar storage runtime.
- Cloudflare Workers/service bindings, Queues and Durable Objects.
- Canonical Academic Catalog IDs spanning course, group, subject, chapter, unit, accounting standard and subtopic, with lineage/alias support.
- Owner-scoped D1 access and server-side chapter/subject applicability validation.
- Server-enforced billing/feature entitlements and R2 storage quota enforcement.
- ICAI sync support for ETag / Last-Modified conditional fetches, parser-zero anomaly protection, last-known-good preservation and review-gated high-impact exam changes.
- Permanent post-retirement checks preventing Supabase runtime reintroduction.

## New Phase 0 implementation

### 1. Stable Autofetch / Source Discovery data contracts

Migration `d1/migrations/0012_product_phase0_autofetch_contracts.sql` adds:

- `autofetch_content_targets`
- `autofetch_source_registry`
- `autofetch_source_locations`
- `autofetch_discovery_candidates`
- `autofetch_resource_records`
- `autofetch_resource_locations`
- `autofetch_resource_versions`

The contract deliberately separates **content/resource identity** from **where the source or file currently lives**. Source and document URLs can therefore move while CA Progress retains the same canonical resource identity and location history.

Existing ICAI sources/resources are backfilled conservatively into the new sidecar model without rewriting the existing public resource tables.

### 2. Source identity and recovery contracts

`lib/autofetch/contracts.ts` defines:

- source/resource health states;
- discovery methods;
- recovery order: redirect → parent/index → sitemap → official search → verified external-search discovery → manual review;
- URL-independent canonical identity material;
- likely direct-document detection;
- high-impact/critical review policy.

The URL is explicitly excluded from the canonical identity material.

### 3. Private-by-default visibility contract

`lib/product/privacy.ts` establishes the shared visibility classes:

- `private`
- `buddy`
- `public`
- `moderation`

The default is `private`. Buddy and moderation visibility require server-side relationship/authorization context. Later Study Profile, Notes and Articleship phases can consume this contract rather than inventing incompatible visibility rules.

### 4. Stable direct official-resource open route

`app/(student)/resources/[id]/open/route.ts` adds a stable resource redirect boundary.

The route:

- accepts the canonical autofetch resource ID or the retained ICAI resource row ID;
- resolves only current, active, verified resources;
- refuses broken/review-required locations;
- prefers the latest stored `direct_file_url`;
- validates the destination against the approved ICAI host policy;
- returns a `307` redirect rather than proxying the official document bytes;
- uses `no-store` and `no-referrer` response policy.

This is the foundation for the requested behavior where selecting an item such as **AS 1** can open the actual latest verified ICAI PDF/document rather than merely opening the listing page that contains AS 1/AS 2/etc.

### 5. Retained-production D1 deployment boundary

The retained production D1 database predates Wrangler's current migration journal. The first Phase 0 deployment attempt proved that Wrangler considered historical migrations `0003` onward pending even though their schema changes already existed, causing a safe pre-deploy failure on the existing `role` column.

The deployment workflow was corrected so:

- fresh/local validation still applies the complete ordered migration chain and verifies idempotence/foreign keys;
- retained production applies only the new idempotent Product Phase 0 migration `0012` directly;
- deployment verifies Phase 0 schema/version counts and `PRAGMA foreign_key_check` before Worker rollout.

No historical production schema was replayed or destructively reset.

### 6. Phase 0 regression contract

`tests/product-phase0-contracts.test.mjs` locks:

- the Cloudflare-only runtime boundary;
- canonical academic IDs;
- private user/academic mutation scoping;
- server-side entitlement and storage quota enforcement;
- URL-independent autofetch identity/location contracts;
- retained ICAI last-known-good and high-impact review behavior;
- stable direct-resource redirect behavior;
- retained production D1 deployment strategy;
- the separate CA Mentor implementation boundary.

## Validation evidence

### V2 CI

- Run: `34004180860`
- Job: `101408281322`
- Head: `893ff6030d5f2d21e1ce3fe8e9fd06d9a8ebcd87`
- Result: **SUCCESS**

Passed:

- permanent retirement enforcement;
- typecheck;
- lint;
- retained D1 hot-index validation;
- Next.js production build;
- OpenNext build and Worker dry-runs;
- Cloudflare SSR smoke;
- repository-wide tests;
- final retirement rescan.

### Permanent retirement closure

- Run: `34004180914`
- Job: `101408281234`
- Head: `893ff6030d5f2d21e1ce3fe8e9fd06d9a8ebcd87`
- Result: **SUCCESS**

The new Phase 0 code does not reintroduce Supabase runtime paths.

### Real Cloudflare deployment

- Run: `34004180866`
- Job: `101408281287`
- Head: `893ff6030d5f2d21e1ce3fe8e9fd06d9a8ebcd87`
- Result: **SUCCESS**

Passed in deployment order:

- repository gates and generated SSR smoke;
- pre-deploy evidence capture;
- remote Product Phase 0 D1 migration `0012`;
- Phase 0 D1 verification;
- ICAI Worker deployment;
- Billing Worker deployment;
- web Worker secret verification;
- web runtime deployment;
- post-deploy production smoke / D1 verification;
- deployment evidence upload.

No automated rollback was triggered.

## Phase 0 definition-of-done result

- Canonical academic identity is available for new study-domain records: **PASS**.
- Cloudflare-only runtime remains enforced: **PASS**.
- CA Thinker/Mentor implementation remains separate: **PASS**.
- Shared private-by-default visibility boundary exists: **PASS**.
- Owner and academic scope protections remain server-side and regression-tested: **PASS**.
- Autofetch content identity is independent of source/file URL: **PASS**.
- Source/resource location history contracts exist: **PASS**.
- Stable official-resource direct-open route exists: **PASS**.
- Existing last-known-good and high-impact review safeguards remain intact: **PASS**.
- Phase 0 schema is applied and verified on retained production D1: **PASS**.

## Deliberate Phase 0 boundary

Phase 0 establishes the **durable contracts and executable redirect boundary** for the self-healing Autofetch system. It does **not** claim that every planned autonomous rediscovery path is fully implemented yet.

Specifically, richer execution such as automatic parent-page crawling, sitemap rediscovery, external-search fallback, confidence-scored replacement adoption and deep extraction of every listing-page document remains work for the later phases that consume Autofetch. The existing ICAI sync continues to provide the already-working conditional-fetch, anomaly and review protections in the meantime.

Likewise, the new `/resources/[id]/open` route opens a stored verified direct document when one is available; later resource-consumer work is responsible for resolving more listing-page items such as individual AS/RTP/MTP documents into those direct URLs.

This distinction prevents Phase 0 from overclaiming Product Phase 1 or later implementation.

## Sequencing

- Revised CA Progress Product Phase 0: **COMPLETE**.
- Revised CA Progress Product Phase 1: **NOT STARTED**.
- CA Mentor Phase 3: **NOT STARTED**.
- `main`: **NOT MERGED**.
