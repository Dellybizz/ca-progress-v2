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
- Pre-release public health is healthy but still shows the old release and finite one-year quotes. This is baseline evidence, not evidence of the Phase 6 deployment.

## Live completion gate

The workflow's `live-release.json`, signed inbox convergence evidence, and deployed Worker versions establish release completion. A published branch or successful local test is not a live deployment result. The workflow holds new checkouts until these checks pass.

Real first-and-next bank cycles cannot be certified by advancing a fixture clock or reading Plan configuration. Monthly/yearly UPI, card and eMandate authorization, account-specific bank offers, cancellation delivery and actual refunds need real provider evidence. Storage warning delivery needs provider acceptance receipts before any permanent deletion can run. The documented 100-year provider mandate limit remains bounded and requires fresh approval at its end.
