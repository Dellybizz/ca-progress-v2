# CA Progress Product Phase 10 Status

**Status:** COMPLETE AND PRODUCTION VALIDATED  
**Completed:** 2026-09-07  
**Phase:** Study Profile, visibility and privacy  
**Validated implementation head:** `9859c628ec17ceee0a26ba5a40190c533a87374b`  
**Branch:** `phase-12-operations-admin-platform`

## Scope completed

Product Phase 10 adds private-by-default Study Profiles with granular visibility and strict server-side authorization while keeping private academic data outside the public profile boundary.

Completed work:

- Added Study Profiles that are private by default.
- Added independent `private`, `buddies` and `public` visibility scopes for the base profile, progress and streak data.
- Added separate opt-ins for CA level and target attempt so a broader profile scope cannot expose those fields without explicit consent.
- Added exact-user-ID buddy access grants without public user search or discovery.
- Centralized Study Profile access decisions on the server and serialize only allowlisted fields.
- Omit hidden fields entirely rather than returning private values or private data-shape hints.
- Make private/inaccessible and nonexistent Study Profile reads indistinguishable to unauthorized viewers.
- Avoid querying progress or streak aggregates when the current viewer is not authorized to see them.
- Keep test scores, private notes, reflections, test attachments and storage object keys outside Study Profile responses.
- Require authentication and same-origin checks for Study Profile privacy and buddy-access mutations.
- Added a read-only Study Profile viewer and owner-only privacy controls.
- Kept the Phase 10 runtime Cloudflare/D1-only.
- No Phase 11 accountability, shared-goal or Study Together features were added.
- No Supabase runtime or fallback was reintroduced.

## Data and API boundary

- D1 migration: `d1/migrations/0020_product_phase10_study_profiles.sql`.
- Central Study Profile privacy policy: `lib/profile/study-profile-policy.mjs` with TypeScript declarations in `lib/profile/study-profile-policy.d.mts`.
- Owner privacy controls are integrated into `app/(student)/settings/profile/page.tsx`.
- Read-only viewer surface: `app/(student)/study-profile/[userId]/page.tsx`.
- All viewer-facing profile data is produced through the server-side Study Profile authorization/serialization boundary rather than client-side hiding.
- Dedicated Phase 10 privacy/access regression coverage contains 9 tests spanning private, public and buddy access plus leakage and production-migration boundaries.

## Definition of done

1. **New accounts are private by default. — PASS**
   - Missing Study Profile settings resolve to private defaults.
   - A new account does not become publicly viewable without an explicit owner visibility change.

2. **Global profile visibility cannot expose a field unless that field's opt-in is enabled. — PASS**
   - CA level and target attempt use independent opt-ins.
   - Hidden fields are omitted from the serialized response instead of being exposed as nullable private values.

3. **Public API/profile endpoints cannot fetch private notes or test scores. — PASS**
   - Study Profile serialization is allowlisted and does not include private notes, test scores, reflections, test attachments or private storage object keys.
   - Unauthorized progress/streak aggregates are not queried merely to be hidden later.

4. **Buddy-visible fields require an accepted buddy relationship. — PASS**
   - Buddy visibility is resolved server-side.
   - Arbitrary authenticated users do not satisfy the buddy scope.
   - Buddy grants are exact-user-ID scoped and do not create a public discovery surface.

5. **Phase 10 remains isolated from Phase 11. — PASS**
   - No accountability system, shared goals or Study Together feature was added.

## Dedicated regression evidence

Phase 10 added 9 dedicated regression checks covering:

- private-by-default settings;
- public profile access;
- buddy-only profile access;
- independent progress/streak visibility;
- independent CA-level/target-attempt opt-ins;
- private-data leakage prevention;
- inaccessible/nonexistent profile equivalence;
- authenticated, same-origin mutation boundaries;
- production migration `0020` wiring and verification.

## Validation and production evidence

### Repository gates

Validated against implementation head `9859c628ec17ceee0a26ba5a40190c533a87374b`:

- Permanent Supabase retirement enforcement — **PASS**.
- Typecheck — **PASS**.
- Lint — **PASS**.
- Retained D1 hot-query/index validation — **PASS**.
- Repository tests — **PASS**.
- Next.js production build — **PASS**.
- OpenNext / Cloudflare Worker build and production dry-runs — **PASS**.
- Generated Cloudflare SSR smoke — **PASS**.
- Dedicated Phase 10 privacy/access regressions — **9 checks PASS**.

### V2 CI

- Run: `34054658060` — **PASS**.
- Job: `101544205731` — **PASS**.
- Validated commit: `9859c628ec17ceee0a26ba5a40190c533a87374b`.

### Permanent Retirement Closure

- Run: `34054658038` — **PASS**.
- Job: `101544204570` — **PASS**.
- Permanent Supabase retirement scan, repository tests, typecheck, lint, build and Cloudflare SSR smoke all passed.

### Cloudflare deployment

- Deployment run: `34054655842` — **PASS** end to end.
- Deployment job: `101544225580` — **PASS**.
- Remote D1 migration `0020_product_phase10_study_profiles.sql` — **PASS**.
- ICAI service deployment — **PASS**.
- Billing service deployment — **PASS**.
- Web runtime deployment — **PASS**.
- Post-deploy production verification and D1 integrity checks — **PASS**.
- Deployment evidence upload — **PASS**.

The successful deployment executed the complete production gate sequence: permanent retirement enforcement, typecheck, lint, D1 validation, repository tests, Next.js build, OpenNext/Worker dry-runs, Cloudflare SSR smoke, remote additive migration, service deployments, web deployment and post-deploy verification.

## Privacy and security boundary

- Default state is private, including when no explicit Study Profile settings row exists.
- Visibility is evaluated server-side; UI state is not an authorization boundary.
- Global/base profile visibility cannot override per-field consent.
- Buddy-only data requires the server to resolve an accepted buddy relationship.
- Public and unauthorized responses never include private Notes or Test Archive data.
- Hidden data is omitted from serialization, reducing metadata leakage.
- Inaccessible and nonexistent profile reads intentionally share the same unavailable behavior.
- Mutation routes require authentication and same-origin requests.
- No social discovery/search behavior was introduced in Phase 10.

## Roadmap status

- Product Phase 0 — COMPLETE
- Product Phase 1 — COMPLETE
- Product Phase 2 — COMPLETE
- Product Phase 3 — COMPLETE
- Product Phase 4 — COMPLETE
- Product Phase 5 — COMPLETE
- Product Phase 6 — COMPLETE
- Product Phase 7 — COMPLETE
- Product Phase 8 — COMPLETE
- Product Phase 9 — COMPLETE
- **Product Phase 10 — COMPLETE**
- Product Phase 11 — **NOT STARTED**

**Product roadmap: 11 / 26 phases complete.**

Phase 10 is formally closed. Stop here before Product Phase 11. `main` remains unchanged and unmerged. Supabase remains permanently retired from the CA Progress runtime.
