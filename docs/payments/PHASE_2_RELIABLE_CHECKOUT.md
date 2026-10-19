# Phase 2 — Reliable Checkout

A checkout intent is reserved in D1 before any subscription create request. A unique account slot and a lease serialize double taps and parallel tabs. Retries preserve the original request ID, policy, payment method, offer, first charge and recurring charge. Browser storage contains only versioned, account-scoped checkout identifiers and chosen terms.

The provider payload is saved before dispatch. The provider subscription ID is saved before the local subscription projection. A network timeout, invalid provider response or database interruption retains the original attempt. Recovery uses provider reads, matching the original request notes, user, policy, plan, offer, quantity and billing count. It never sends a second create request after possible dispatch. Missing, multiple or incomplete inventory matches retain an uncertain attempt for reconciliation. An explicit provider rejection before creation releases the account slot; transient responses retain it.

Pricing can resume the original mandate with its saved commercial terms. Billing and pricing offer a private payment status check after refresh or restart. Interrupted callbacks are reconciled against provider state. Verified webhooks can restore a missing local checkout projection before processing the event; hourly recovery also scans a bounded set of pending attempts. A payment failure event remains recoverable rather than automatically creating another mandate. Authorization alone never produces a success message: the server must report actual current subscription access.

The database permits one access row per provider subscription. Campaign reservations remain held while a possibly dispatched checkout is uncertain. No automatic provider cancellation or plan mutation is introduced. Existing native store commerce restrictions apply to all new recovery mutations and UI controls.

## Verification

Integration tests run against SQLite with the production checkout migration and subscription schema. They inject concurrent requests, stale terms, provider rejection, lost responses, missing or duplicate provider inventory, offer drift, projection failures and lost callbacks. They assert provider create counts, account isolation, durable recovery and unique access. Full repository checks, TypeScript, lint and builds remain required.

The release applies migration 0070 before deploying the private billing worker, then the web worker. Live evidence verifies schema indexes, migration ledger, absence of duplicate access, anonymous recovery rejection and preserved method-aware quotes. It exports aggregate counts, never customer identifiers. Live failure injection or real bank authorization is not claimed. Real payment capture, bank compatibility certification and renewal repair remain later phases.

## Release status

Phase 2 is complete and deployed as implementation commit `b4ad596529bba5c4dd18bfe283c7f4ac0355baf0`.

Successful release: https://github.com/Dellybizz/ca-progress-v2/actions/runs/36736686214.

- All 937 repository tests passed, including 19 checkout integration and browser-storage scenarios. TypeScript, ESLint, retirement verification, production build and Cloudflare build passed.
- Migration 0070 was applied before billing deployment. The retained migration ledger and foreign-key checks passed. The live checkout table and all three unique indexes were verified; duplicate provider access rows were zero.
- Anonymous status and recovery requests returned HTTP 401 with private/no-store caching. All 15 live payment-method quotes passed.
- Billing version `071d4ec5-718e-43f3-9d9e-53d0844d6bb3` and web version `217d56fa-a5a9-4f55-af2c-9fe543e1e75b` serve 100% of traffic. Billing upload was 116.26 KiB, 29.22 KiB compressed.
- The release artifact contains aggregate live schema, endpoint and pricing evidence. The broader commercial inventory reported no findings but remains partial: Razorpay Offer/method GET restrictions and absent separate Phase 0 audit exports remain explicit coverage limits.

Failure recovery was exercised with a deterministic provider and real SQLite constraints. This release did not create live customer checkouts or test bank authorization, captured payments or renewal execution. Those proofs remain outside Phase 2.
