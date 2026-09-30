# Phase 2 — Reliable Checkout

A checkout intent is reserved in D1 before any subscription create request. A unique account slot and a lease serialize double taps and parallel tabs. Retries preserve the original request ID, policy, payment method, offer, first charge and recurring charge. Browser storage contains only versioned, account-scoped checkout identifiers and chosen terms.

The provider payload is saved before dispatch. The provider subscription ID is saved before the local subscription projection. A network timeout, invalid provider response or database interruption retains the original attempt. Recovery uses provider reads, matching the original request notes, user, policy, plan, offer, quantity and billing count. It never sends a second create request after possible dispatch. Missing, multiple or incomplete inventory matches retain an uncertain attempt for reconciliation. An explicit provider rejection before creation releases the account slot; transient responses retain it.

Pricing can resume the original mandate with its saved commercial terms. Billing and pricing offer a private payment status check after refresh or restart. Interrupted callbacks are reconciled against provider state. Verified webhooks can restore a missing local checkout projection before processing the event; hourly recovery also scans a bounded set of pending attempts. A payment failure event remains recoverable rather than automatically creating another mandate. Authorization alone never produces a success message: the server must report actual current subscription access.

The database permits one access row per provider subscription. Campaign reservations remain held while a possibly dispatched checkout is uncertain. No automatic provider cancellation or plan mutation is introduced. Existing native store commerce restrictions apply to all new recovery mutations and UI controls.

## Verification

Integration tests run against SQLite with the production checkout migration and subscription schema. They inject concurrent requests, stale terms, provider rejection, lost responses, missing or duplicate provider inventory, offer drift, projection failures and lost callbacks. They assert provider create counts, account isolation, durable recovery and unique access. Full repository checks, TypeScript, lint and builds remain required.

The release applies migration 0070 before deploying the private billing worker, then the web worker. Live evidence verifies schema indexes, migration ledger, absence of duplicate access, anonymous recovery rejection and preserved method-aware quotes. It exports aggregate counts, never customer identifiers. Live failure injection or real bank authorization is not claimed. Real payment capture, bank compatibility certification and renewal repair remain later phases.

## Release status

Implementation and release verification are in progress. Completion requires a successful Phase 2 release workflow and live verification artifacts.
