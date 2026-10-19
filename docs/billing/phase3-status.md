# Payment Rules Phase 3 — Plan Changes and Billing Switches

Baseline: Phase 2 (local `9cd4b3e4`; published `0c1b3d09`).

## Implemented

- Striver → Ranker upgrades and same-plan monthly ↔ yearly switches use fresh AutoPay checkout. Verified invoice-backed payment starts the new service period, with no unused-time credit. Only verified replacement evidence retires the old renewal.
- Replaced access ends at the new service boundary. Invoice and payment history remains intact; later reconciliation cannot restore the unused old period or expose it as reactivation time.
- Ranker → Striver uses a fresh UPI mandate whose first service charge is scheduled at the source's verified paid expiry. Creating or opening checkout does not schedule the downgrade. Fresh provider ownership, plan, start date and authenticated status are checked before showing the scheduled change.
- Before expiry the old mandate remains unchanged. Reversal closes the unpaid replacement, confirms provider cancellation and clears the schedule without an immediate charge. Durable reversal intent survives provider failure. Cancelling the source also closes its pending downgrade.
- At the immutable boundary, an approved replacement retires old collection. Unpaid authorization does not grant paid target access. A revoked replacement before expiry removes the schedule and preserves current renewal.
- Late old renewal charges after the downgrade boundary queue idempotent full refunds and cannot extend old access. Immediate-replacement late charges retain their existing compensation flow; a payment is not dispatched through both refund ledgers.
- Legacy `change_plan` cannot PATCH an unapproved replacement plan. Pricing routes new changes through checkout and retains legacy reversal support.
- Pricing distinguishes the selected product from its tier, so monthly and yearly products remain selectable. Checkout explains immediate no-credit changes and deferred downgrade charges; recovery displays confirmed mandate approval separately from verified paid access.
- Additive migration `0089_owner_plan_switches.sql` is included in the retained migration runner.

## Validation

- Full repository suite: 1,203 passing tests, zero failures.
- 28 switching tests include annual upgrades, both same-tier billing directions, authorization failure, fixed downgrade expiry, reversal, revoked mandates, wrong ownership, unpaid replacements, idempotent compensation and old-access resurrection prevention.
- TypeScript, ESLint, production build and whitespace checks pass.
- Provider calls are mocked; no real payment, mandate or refund was created for testing.

## Release boundary

The billing worker runs every five minutes and also maintains switches after verification and reconciliation requests. Provider debits already in flight can race boundary cancellation; verified old charges are refunded rather than counted as paid access. Unknown provider evidence remains pending and is retried. Live validation of first-charge scheduling, cancellation and refund delivery belongs to Phase 6 before release.

Phases 4 (storage cleanup), 5 (recurring gifts) and 6 (live verification/release) remain pending. This phase does not deploy the incomplete overall rollout or activate unvalidated annual provider mappings.

Provider references reviewed:
- https://github.com/razorpay/razorpay-node/blob/master/documents/subscription.md
- https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription/
