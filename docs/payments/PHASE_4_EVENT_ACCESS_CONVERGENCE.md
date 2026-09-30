# Phase 4 — Event/access convergence

Definition of done: durable signed inbox, retryable failed events, invoice-cycle reconciliation, atomic access/outbox and cache invalidation. Duplicate, reordered and missed events must converge exactly once, with access using the captured payment's actual service dates.

## Implementation

The web service forwards untouched webhook bytes. The private billing service verifies HMAC before parsing or persistence, rejects malformed bodies and limits streamed input to 512,000 bytes, and saves the exact validated UTF-8 body, hash and provider event ID in D1 before returning 202. Conflicting payloads under the same event ID receive 409. A shared D1 counter limits valid signed ingress to 500 deliveries per minute by default; `BILLING_WEBHOOK_MAX_PER_MINUTE` can tune this for merchant volume. Excess receives 429 for provider retry; invalid signatures cannot consume this counter. Queue messages contain only an inbox reference. Queue outages cannot lose accepted work: a five-minute scanner reclaims due inbox work and expired processing leases.

Accepted events carry their verification record, so processing does not depend on the current webhook secret. An optional `RAZORPAY_WEBHOOK_SECRET_PREVIOUS` accepts deliveries during rotation. This release does not rotate credentials. Failed processing stays retryable with bounded backoff; twelve failed attempts move it to review, exposed in private health counts. A duplicate receipt is completed only when its work succeeded. Historical failed recurring receipts and campaign failures can be replayed under their original IDs. After reviewing the cause, an authenticated Owner/Parent Owner can POST `/api/admin/billing/replay-event` with `eventKey`, a unique `requestId` and `reason`. The reset and immutable replay audit commit together; the same request is idempotent and conflicting reuse fails. Processed events cannot be reset.

Provider payloads are hints. Processing reads current subscription, invoice and captured payment facts. Payment-only events resolve their subscription through the invoice. Unknown checkout records with owned checkout notes recover through the Phase 2 reserved operation. Introductory invoice identity and service dates use Phase 3's reconciler. A delayed first-cycle or failed event cannot overwrite a newer successful renewal. A delayed active event cannot undo a verified cancellation. Financial holds prevent new paid projections; comprehensive refund/dispute policy remains Phase 9.

All recurring entry points, including signed callbacks and recovery, serialize the contract before reading fresh provider state. A fenced D1 batch commits contract projection, access, its policy snapshot and lifecycle event together. The fence validates lease ownership, expiry, projection version and absence of a refund/dispute hold. Invoice ledger persistence is idempotent and can precede this transaction: if projection fails, a retry reuses the original invoice and captured payment.

Database triggers write the access-change notification outbox and increment a durable feature-cache revision inside the same transaction. Duplicate reconciliation with unchanged access creates no additional access-change event or notification. Old pending notices are superseded when access changes. A bounded dispatcher hands each surviving notice to `notification_outbox` using a unique key. This is internal notification work, not evidence of email/SMS delivery; reminder templates and channel delivery belong to later phases.

Each request reads the user's durable revision before reusing an edge feature cache. Request-scoped memoization avoids repeated revision reads within one request. Local invalidation continues for existing administrative operations. Queue-driven changes therefore invalidate cached access at every location on the next request.

## Verification

Compiled-worker tests use actual SQLite migrations and transactional batches, with injected provider responses. They cover raw signature validation, persistence failure, duplicate deliveries/callbacks, provider failure and replay, queue outage, missed event/callback recovery, introductory event replay after full renewal, payment-only events, cancellation reordering, campaign replay, concurrent workers, expired leases, financial holds, transaction rollback, secret rotation, superseded notifications and two primed edge caches observing grants/revocation.

Live release verification checks migration 0072, inbox indexes, projection fences, atomic outbox/revision triggers and duplicate-access absence. It submits one deliberately non-financial signed certification event twice through the public webhook endpoint, verifies the exact raw bytes were durable at acknowledgement, waits for real queue processing and rejects an invalid-signature probe. It makes no provider mutation and creates no payment, mandate, invoice or access grant.

## Release record

Implementation verification and deployment are in progress. Phase 3 real first-and-next-cycle certification remains separately pending. Phase 4 tests do not claim live bank authorization or automatic renewal proof.

## References

- https://razorpay.com/docs/webhooks/best-practices/
- https://developers.cloudflare.com/d1/worker-api/d1-database/

Checked 1 October 2026 IST.
