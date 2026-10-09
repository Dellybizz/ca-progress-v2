# Phase 5 — Failure, grace and recovery

Fixed grace, method-aware recovery guidance, durable in-app reminders and data-preserving access expiry.

## Behavior

Both ordinary and campaign reconciliations use the same failure policy. Grace starts at the last verified captured invoice's paid-through boundary and uses the saved contract's `grace_days`. Repeated pending/halted events cannot restart it. A contract with zero saved grace receives none; a first unpaid purchaser receives no renewal grace. Pause, cancellation and financial holds cannot manufacture grace. Provider `active` without a newly captured service period cannot clear an existing unpaid renewal.

Migration 0073 persists the failure anchor and customer reminders in the same contract projection transaction. Each reminder is unique by subscription, cycle boundary and template. It covers renewal within three days, first failure, grace ending within 24 hours, expiry and verified payment. Verified recovery suppresses stale failure reminders; cancellation suppresses future renewal reminders; financial holds suppress outstanding reminders. The existing web drawer, notification center and authenticated notifications API show the same in-app notices. Mark-read operations remain owner-scoped. Email/SMS delivery is not claimed.

The five-minute billing cron performs local boundary maintenance before provider reads. It expires overdue recurring access, writes one lifecycle event and reminder, and increments the existing durable cache revision atomically. It never deletes study data, closes a provider mandate or initiates a charge. The next request's cache identity also changes when an access boundary passes, so expired entitlement cannot remain cached until the cron runs. Existing entitlement and quota checks enforce the Free fallback; saved structured records can be downloaded through the plan-independent, authenticated `/api/v1/account/data-export` JSONL stream. It reuses the existing owner-scoped dataset and safe-column whitelist, paginates at 100 rows, excludes operational tables and stops on cancellation. Original files retain their existing owner-only download links. Paid CSV/report and bundled full-backup products retain their existing policy.

Billing selects a still-valid paid/grace contract before a newer abandoned checkout. The recovery screen shows the verified paid-through date, saved grace deadline, subscription reference and method-specific instructions. Card/UPI retry guidance reflects provider-owned retries on following days; eMandate guidance waits for the bank decision. Halted subscriptions show that automatic retries stopped. Customers use the provider's existing subscription notification and refresh server verification. This release creates no generic settlement link, parallel mandate, automatic method migration, manual charge or merchant debit retry. A method migration must preserve the saved price and method-specific offer and remains a deliberate later-phase action.

A temporarily unreadable renewal invoice cannot erase fixed grace already backed by a previously verified captured period. The fenced fallback preserves paid count and paid-through, records verification pending and applies only the saved grace deadline.

Late recovery restores the existing access row through the actual captured invoice's service dates. A provider status change, checkout callback, authorization payment, unpaid invoice or receipt alone cannot extend paid coverage.

## Verification and limits

Compiled-worker tests run against SQLite migrations and transactional batches. They exercise repeated failures, provider active without payment, pending recovery, halted expiry, first unpaid purchase, zero grace, cancellation/pause, reminder deduplication/suppression, provider outage, late recovery, finance holds and transaction rollback. Prior checkout, renewal, webhook, lease, campaign and cache regression tests remain in the release suite.

The release workflow runs repository checks and both Cloudflare builds, applies migration before deploying billing/web, retains Phase 1–4 probes, and verifies live schema, grace anchors, reminder uniqueness, overdue projections and notification authentication. The Phase 5 probe is read-only and exports only aggregate counts. Live bank failure/recovery is not inferred from schema checks or simulated provider responses. Phase 3's real first/next-cycle certification remains pending until authorized bank evidence exists.

Provider reference checked 9 October 2026: https://razorpay.com/docs/payments/subscriptions/payment-retries/

## Release evidence

Implementation checks and deployment are in progress. Final deployment identifiers and aggregate live results will be recorded after the release workflow succeeds.
