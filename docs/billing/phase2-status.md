# Payment Rules Phase 2 — Renewal and Commercial Execution

Baseline: local Phase 1 commit a7048246.
Status: implemented locally; no live migration, provider writes, push or deployment.

## Implemented

- Monthly renewal failures retain paid features for three days; annual failures retain them for ten days. Recovery retains the original billing dates, including grace and time without access. A payment covering an already-ended period does not create a new period.
- Immediate failure, daily in-app reminders during grace and the final deadline reminder are deduplicated. Recovery and cancellation suppress stale notices. Access expires to Explorer at its fixed boundary.
- Seven further days of recovery after grace, followed by a durable, retried provider cancellation. Fresh ownership and payment evidence are checked before stopping collection; already-recovered subscriptions are reconciled instead.
- Cancellation during renewal grace immediately ends courtesy access and records a durable cancellation intent. Provider failures remain pending for worker retries. A later captured renewal is queued for a full, idempotent refund; its refund callback preserves access from an earlier paid period.
- Cancellation during a paid period preserves paid expiry. Same-plan reactivation uses a fresh authorized mandate when needed and schedules its first charge at the existing expiry; checkout shows the first-charge date.
- Published price decreases stop the old renewal and request a new mandate at the immutable promised lower price. Ten days of approval grace follows paid expiry. Pending approval is visible in Pricing and Billing. Later price increases cannot silently replace an awaiting approval price.
- Admin retirement stops renewal while preserving verified paid time. Future-effective publications are scanned by the scheduled worker. Successful replacement payment ends the old source only when replacement access actually covers the current date.
- Additive migration 0088 supplies durable cancellation/refund obligations, collection deadlines, commercial execution leases and replacement links. The retained migration ledger includes it.

## Validation

- Full repository suite: 1189 passed, zero failed.
- Six new owner-rule tests cover monthly/annual boundaries, daily reminder replay, recovery deadlines, cancellation races, price approval/retirement and refund callback isolation.
- TypeScript: passed. ESLint: passed with zero warnings. Next production build: passed. Git whitespace check: passed.

## Release boundaries

Provider responses and financial operations were mocked in tests. Confirm period-end cancellation evidence, fresh-mandate authorization and refund delivery against the configured provider before live release. Unknown cancellation evidence leaves the job pending rather than claiming completion.

The seven-day recovery window is an application boundary, not a promise of daily provider debits. Razorpay controls automatic retry cadence by payment method; halted subscriptions can require hosted payment recovery. Notifications added here are in-app, not a new email delivery integration.

References checked during implementation:
- https://razorpay.com/docs/payments/subscriptions/payment-retries/
- https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription/

Phase 3 switching/downgrade work, Phase 4 storage deletion, Phase 5 gifts and Phase 6 live release checks remain outside this phase.
