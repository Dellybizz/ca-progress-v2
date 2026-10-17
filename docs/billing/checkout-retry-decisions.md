# Confirmed checkout retry decisions — 12 October 2026

Implemented from the four answers confirmed by the owner:

1. Known verified success grants the existing subscription without another charge. For an unconfirmed result, an explicit Pay again action can create a new owner-bound attempt while retaining the original snapshot and recoverability.
2. Refund the complete duplicate captured amount. No gateway fee deduction or account-credit substitution.
3. The latest successfully paid choice wins across overlapping uncertain purchases, including different plans. Earlier confirmed access is retained while the newer attempt is unpaid. Once the newer capture is verified, atomically suppress older access and queue full refunds and cancellation of losing renewals. Established paid-plan upgrades keep their independent switch rules.
4. Refund failures stay visible in Billing, retry in background and create a deduplicated critical admin alert after 24 hours. A later processed refund resolves that alert. Provider-confirmed failed refunds may receive a new idempotency key; uncertain submissions retain their saved key and are discovered before any resubmission.

The original method must be retained for a retry. Switching methods during uncertain payment remains undecided. This release does not implement gifts, storage cleanup or price-change rules.

Safety and execution:
- Each attempt keeps immutable pricing, offer, owner and policy evidence.
- Retry order is allocated transactionally. Signed callback, webhook and recovery projections share the same invoice-backed winner transaction. Database triggers prevent stale losing projections from reactivating access.
- Refunds and mandate closures run on the queue and five-minute scheduled fallback. Ordinary observers never create a payment without the student's action.
- A pending newer choice is not cancelled just because an earlier payment is discovered first.
- Trials and previous settled/expired paid periods cannot be treated as uncertain duplicate purchases.
- Validation includes actual compiled-worker invoice reconciliation in both arrival orders, cross-plan choice, mismatched payment evidence, captured-payment identity, full refunds, lost provider response, closure ownership and 24-hour alert resolution. Tests use simulated provider responses; no live customer charge/refund was created for certification.
