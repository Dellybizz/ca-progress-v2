# Phase P0 — Exact live-state lock and certification baseline

Status: repository implementation complete; credentialed production certification pending.

## Locked source state

- Repository: `Dellybizz/ca-progress-v2`
- Working branch: `hotfix/dark-mode-ae0cb36d`
- Confirmed live base commit: `62189a4054a25f5e287cbab954375e1c12c6b563`
- Production URL: `https://ca-progress-v2.habeebaasif622.workers.dev`
- Worker set: `ca-progress-v2`, `ca-progress-v2-billing`, `ca-progress-v2-icai-sync`
- Retained D1: `ca-progress-v2-phase4-shadow`
- Migration boundary: 48 additive migrations through `0048_chapter_workspace_controls.sql`

This replaces the stale R0 assumption that production remained on `phase-12-operations-admin-platform` with 47 migrations. It does not modify or merge `main`.

## Implemented evidence contract

`npm run audit:refinement:p0` verifies the pinned branch/SHA, three Worker configurations, complete migration boundary, retained commercial tables and the existence of the credentialed production gate.

The manual `Refinement P0 Live State Lock` workflow is intentionally read-only. It:

1. checks out the exact workflow SHA and proves the confirmed live base is its ancestor;
2. runs retirement, type, lint, tests, build, Worker dry-run and consistency gates;
3. records deployment/version references for all three Workers;
4. records an aggregate-only D1 migration, foreign-key, subscription, payment, policy, override, promotion and scheduled-change baseline;
5. creates a rollback manifest containing recoverable Worker deployment/version IDs;
6. verifies the captured evidence and retains it as a workflow artifact.

No user IDs, emails, payment payloads, notes, files or other private row contents are exported. No deployment, rollback or D1 mutation occurs in P0.

## Current commercial/admin finding

The source audit confirms that versioned entitlements, policies, grants, payment orders/events and the private Billing Worker exist. It also confirms why P1–P4 remain necessary: the current admin user route is list-only and the Razorpay path is order/manual-renewal based rather than a complete recurring subscription lifecycle.

## Exit status

Repository implementation: **PASS** once the local P0 audit and focused tests pass.

Production certification: **PENDING** until the credentialed workflow succeeds on the exact P0 implementation commit and its artifact contains:

- three non-empty Worker deployment histories;
- a rollback manifest with deployment/version references;
- exactly 48 remote migration ledger entries through `0048`;
- zero D1 foreign-key violations;
- aggregate commercial-state evidence;
- passing repository and consistency gates.

P0 must not be marked fully complete from source tests alone. P1 has not started.
