# CA Progress Product Phase 15 Status

## Status

**Phase 15: Complete**

- **15A — Canonical Free / Pro / Premium policy:** Complete
- **15B — Subscription lifecycle and safe quota enforcement:** Complete
- **15C — Plan comparison, paid-surface enforcement and beta gate:** Complete
- **Phase 16:** Not started

Phase 15 is closed on the `phase-12-operations-admin-platform` working branch. This record does not merge the branch to `main` and does not begin Phase 16.

## Canonical product contract

| Product plan | Internal tier key | Monthly price | Storage quota |
| --- | --- | ---: | ---: |
| Free | `free` | ₹0 | 250 MB |
| Pro | `basic` | ₹50 | 2.5 GB |
| Premium | `pro` | ₹150 | 15 GB |

The internal `basic` and `pro` keys remain compatibility identifiers. Product-facing policy, labels, prices, quotas and comparisons resolve through the centralized plan policy rather than treating those internal keys as customer-facing plan names.

## 15A — Centralized policy and deterministic entitlements

Completed capabilities:

- one canonical plan hierarchy for Free, Pro and Premium
- deterministic product labels, monthly prices and storage quotas
- centralized feature-to-required-tier policy
- monotonic inheritance: Premium includes Pro and Free; Pro includes Free
- server-owned entitlement decisions rather than browser-trusted plan claims
- shared policy use across billing, exports, resources and gated product surfaces
- Free access preserved for the complete core study loop, basic analytics and baseline forecast

## 15B — Lifecycle, cancellation and quota safety

Completed capabilities:

- lifecycle-aware access for active, paid-through cancellation, bounded grace and expired states
- cancellation keeps paid access through the paid-through date
- bounded grace behavior is explicit and server-resolved
- downgrade never silently deletes user data
- data above a reduced quota remains preserved while future over-quota writes are blocked
- upload authorization and completion both enforce the current storage entitlement
- D1-backed upload reservations prevent concurrent R2 uploads from oversubscribing quota
- abandoned, failed or rejected uploads release or clean up their reservation safely
- billing webhook transitions remain idempotent and policy-derived

## 15C — Comparison UX and paid-surface enforcement

Completed capabilities:

- comparison-first Free / Pro / Premium pricing experience
- canonical ₹0 / ₹50 / ₹150 pricing shown from shared policy
- canonical 250 MB / 2.5 GB / 15 GB storage comparison
- checkout remains locked when server billing configuration differs from canonical policy
- explicit audit catalog for every implemented paid API surface
- lifecycle-aware server feature guard for non-export paid mutations
- Pro enforcement for advanced planner/calendar mutations
- Pro enforcement for detailed goals and richer reports
- Pro enforcement for reminder/customisation preference writes while Free notification read state remains available
- expanded Study Buddy collaboration actions gated at Pro while connection and safety actions remain Free
- advanced analytics gated at Pro while basic analytics and baseline forecast remain Free
- existing Pro CSV and Premium full-backup exports remain server-enforced
- unimplemented Premium ideas remain explicit and are not presented as completed functionality

## Controlled study-product beta gate

`tests/product-phase15c-beta-gate.test.mjs` verifies:

- the canonical plan labels, prices and quotas
- a genuinely usable Free product
- monotonic Free → Pro → Premium upgrades
- comparison-first pricing without leaking internal tier naming
- server enforcement for every catalogued paid API surface
- Free notification read behavior and paid reminder customization
- Free Study Buddy safety/connection behavior and Pro collaboration actions
- non-destructive downgrade behavior
- the implemented retention-loop surfaces: Today → Study → Reflection → Progress → XP → Notes/Test → Analytics → Buddy/Leaderboard → return next day
- explicit separation from Phase 16

The broader Phase 15 policy and lifecycle suites cover guest/new-user defaults, authenticated Free/Pro/Premium access, active and grace states, cancellation, expiry, downgrade and upgrade behavior, storage reservation concurrency, over-quota denial and preservation of existing user data.

## Definition of done

1. **₹0 / ₹50 / ₹150 entitlements are deterministic and server-enforced — PASS**
   - Prices, tier ranks, product labels and feature requirements resolve from the centralized policy.
   - Paid mutations use server-side feature or export guards.

2. **250 MB / 2.5 GB / 15 GB quotas are enforced without downgrade data loss — PASS**
   - Upload intent and completion paths enforce quota.
   - Atomic reservations cover concurrent uploads.
   - Downgrade blocks future excess writes without deleting retained records or R2 objects.

3. **Free remains genuinely usable — PASS**
   - Progress, Today/basic planning, Study, Reflection, chapter/revision/test tracking, basic Notes, Community, gamification, Study Buddy, profile, basic analytics, baseline forecast and exam countdown remain available.

4. **The complete retention loop is represented end-to-end — PASS**
   - The beta gate validates concrete Today, Study/Reflection, Progress, XP/achievement, Notes, Tests, Analytics and Study Buddy surfaces, including the return-loop engagement layer.

5. **Beta smoke covers plan and lifecycle transitions — PASS**
   - Regression coverage includes guest/new-user behavior, Free/Pro/Premium matrices, upgrade inheritance, paid-through cancellation, bounded grace, expiry and non-destructive downgrade.

## Implementation validation

The corrected Phase 15 implementation head `8030ac0c0485b8fb6152232c283c23b804eb93c0` passed both authoritative repository workflows before this closure record was written.

### V2 CI — passed

- Run: `34121365445`
- Job: `101739914018`
- Validated commit: `8030ac0c0485b8fb6152232c283c23b804eb93c0`
- permanent Supabase-retirement enforcement
- TypeScript typecheck
- lint with zero warnings
- retained D1 hot-query index validation
- Next.js production build
- OpenNext Cloudflare build
- ICAI, billing and web Worker dry-runs
- generated Cloudflare SSR smoke
- repository-wide test suite: **413/413 passed**
- final Supabase-retirement recheck

### Supabase Retirement Permanent Closure — passed

- Run: `34121364577`
- Job: `101739910353`
- Validated commit: `8030ac0c0485b8fb6152232c283c23b804eb93c0`
- permanent retirement regression contract
- TypeScript typecheck and lint
- retained D1 index validation
- repository-wide tests
- Next.js and OpenNext builds
- production Worker dry-runs and SSR smoke
- final retirement rescan

## Regression correction

The initial 15C implementation run exposed three retained assertions that still described the earlier product contract. The corrected tests now verify that the baseline forecast belongs to Free, use the canonical `Baseline · Free` label, and assert the current student-facing analytics copy. No runtime entitlement check was weakened to make the suite pass.

## Closure

Phase 15 now has deterministic Free / Pro / Premium policy, non-destructive lifecycle and quota handling, server-enforced paid surfaces, comparison UX and controlled beta coverage for the complete study-product retention loop. Phase 15 is complete. Phase 16 remains intentionally unstarted.
