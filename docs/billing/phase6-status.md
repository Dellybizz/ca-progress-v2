# Payment Rules Phase 6 — Release Validation

Baseline: Phase 5 (`eb86fdb6` published; `18acedf2` local).

## Implemented

- Explicit evidence matrix covering all 47 approved scenarios. The release runner executes 172 relevant tests and records automated results separately from real-bank and email proof.
- Migration rehearsal applies owner migrations 0085–0091 to a retained contract, verifies unchanged paid-access and policy snapshots, checks foreign keys, and verifies that a second retained migration stage skips applied versions.
- SQL transport adds insignificant keyword spacing for Wrangler's compound-statement splitter while preserving quoted strings and comments. Canonical applied migration files remain unchanged. Both local smoke bootstrap and the retained migration runner use the adapter.
- Dedicated same-repository Phase 6 release workflow validates source freshness, regression tests, native bundling, OpenNext, Worker size budgets and SSR smoke before production changes. Existing deployments and financial terms are recorded before migration.
- New payment setups are paused during release verification. Existing verification, renewals, recovery and cancellation operations remain available. Failed post-deploy validation leaves the new-checkout hold in place; it does not silently reopen checkout or undo financial history.
- Provider Plan GET evidence validates published monthly and yearly mappings. Untouched owner-approved annual defaults can be mapped and published, including legacy disabled zero-priced annual placeholders. Edited defaults require the normal admin publishing process. Existing positive published annual pricing is preserved. Publication approval is audited, and offers, service rules and exact provider terms are checked.
- Public health checks read actual Worker service bindings, probe the private billing service, and expose its rule phase and release checkout hold. The release verifies the web build SHA, billing version, live quote durations, recipient attribution, account counts and retained financial contracts.
- Private gift, checkout and storage endpoints are checked for authentication. Signed non-financial webhook probes verify durable inbox and queue convergence using the existing proof runner. No live customer subscription, debit, cancellation or refund is created by the release verifier.
- Optional storage email credentials are retained or configured from deployment secrets. Missing credentials continue to hold irreversible cleanup behind the required warning receipts.

## Local evidence

- Full repository suite: 1,250 passing tests, zero failures.
- Scenario runner: 172 passing tests across all 47 scenario groups.
- Migration rehearsal, TypeScript, ESLint, production/OpenNext build and native bundle pass.
- Compressed Worker budgets: ICAI 0.584 MiB, billing 0.069 MiB, web 3.173 MiB; all below repository limits.
- Wrangler local migration bootstrap now completes through 0091. SSR server startup is blocked in this workspace by `uv_interface_addresses`; the GitHub release workflow runs the required SSR smoke on Ubuntu before deployment.
- GitHub release rehearsal passed the full repository checks, SSR smoke and production migration ledger through 0091, with clean foreign keys. The first deployment attempt stopped before Worker changes because the CLI was outside the executable path; the corrected workflow uses the installed package runner.
- The corrected release deployed web and billing Workers and validated/published annual defaults without creating customer charges. The immediate post-deploy health probe met an edge propagation delay; verification now waits for the exact deployed version before continuing. The hold was subsequently cleared after the complete live proof passed.
- Pre-release public health is healthy but still shows the old release and finite one-year quotes. This is baseline evidence, not evidence of the Phase 6 deployment.

## Production release evidence

Release source: `299e71af25abf16b9d9dc1e98af2e1587716cf1d` on `payment-rules-phase6`.
[Release workflow 38387784711](https://github.com/Dellybizz/ca-progress-v2/actions/runs/38387784711) succeeded on 13 October 2026.

- Retained migration stages found all 80 required migrations and clean foreign keys.
- Web Worker version: `4c3f9063-f4d8-410e-9f45-29189ad7a044`.
- Final billing Worker version: `fdf43659-2ed2-4b56-8f46-68ecf5f6b0d9`.
- Live verifier passed before and after reopening: four provider products and twelve method-aware quotes, authenticated endpoints, retained financial terms and account data, and signed inbox convergence.
- Public health independently confirms the exact release SHA, database and billing health, and `billingCheckoutPaused=false`.
- Annual checkout is enabled at Striver INR 500/year and Ranker INR 1250/year. Existing positive admin pricing remains authoritative.
- Storage-warning credentials are absent from the GitHub release environment. Email delivery remains unverified and the required receipts continue to block permanent cleanup.
- Real first/next bank cycles remain unverified; no customer charge was created by release verification.

## Live completion gate

The workflow's `live-release.json`, signed inbox convergence evidence, and deployed Worker versions establish release completion. A published branch or successful local test is not a live deployment result. The workflow holds new checkouts until these checks pass.

Real first-and-next bank cycles cannot be certified by advancing a fixture clock or reading Plan configuration. Monthly/yearly UPI, card and eMandate authorization, account-specific bank offers, cancellation delivery and actual refunds need real provider evidence. Storage warning delivery needs provider acceptance receipts before any permanent deletion can run. The documented 100-year provider mandate limit remains bounded and requires fresh approval at its end.
