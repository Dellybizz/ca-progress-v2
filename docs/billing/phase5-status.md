# Payment Rules Phase 5 — Recurring Gifted Memberships

Baseline: Phase 4 (local `8754d622`; published `f2fa5aba`).

## Implemented

- Gifts have separate purchaser and recipient roles. Offers use an exact student username; only an active student on a lower plan is eligible. Recipient acceptance is required before the purchaser can authorize payment. One accepted offer is allowed at a time; an existing Striver gift can be replaced by a higher Ranker gift.
- Monthly and annual gifts use fresh, long-running AutoPay mandates at the normal published price. Introductory discounts, campaign offers, trials and unused-time credits do not apply. Annual plans remain subject to their existing administrative checkout enablement.
- Captured invoice evidence activates the recipient's membership. Provider authorization alone grants no paid access. Provider gift, recipient and purchaser identities are checked. Database projection guards preserve verified financial attribution while permitting a different access beneficiary.
- A higher gift starts immediately after verified payment. Prior renewal retirement additionally rechecks fresh provider subscription, invoice and captured payment evidence. Prior paid history is retained, unused access is consumed at the gift start, and later source renewal charges receive full refund obligations. Failed source cancellation remains durable and retryable.
- Either purchaser or recipient can stop gift renewal. Verified paid access continues to its expiry; cancellation during unpaid grace ends grace immediately. Cancellation before first capture grants no access. Late captured charges are queued for full refunds through the existing idempotent refund machinery, including when provider cancellation is delayed.
- Gifts retain existing retry arbitration, locked renewal prices, lower-price reapproval and collection recovery rules. Retry requests keep the gift recipient and plan. A purchaser's own paid membership does not prevent a gift retry or borrow the gift's prepaid service time.
- Recipients can replace a gifted source with their own plan. Switches retain the source's financial owner while projecting access to the recipient. Purchasers manage their gift payments independently of their personal membership.
- `/gifts` provides offer, accept, decline, payment and cancellation flows, with saved checkout recovery and periodic refresh. Billing links to gift management and identifies sponsored access. Native storefront checkout restrictions are preserved. Account deletion cancels gift obligations for either role for worker maintenance.
- Migration `0091_recurring_gift_memberships.sql` and the retained migration ledger registration are included. Scheduled and queue maintenance process gift cancellation, source retirement and existing payment/refund operations.

## Validation

- Full repository suite: 1,244 passing tests, zero failures.
- Gift tests cover role ownership, acceptance, exact request identity, same/lower-plan rejection, changed eligibility, recurring recipient projection, authorization-only behavior, callback confirmation, both cancellation roles, provider outage, pre-capture cancellation, late refund deduplication, fresh source retirement proof and higher gifts replacing sponsored access.
- Additional tests cover financial ownership during recipient replacement and recipient-only prepaid service attribution. The full migration replay test includes the additive gift migration.
- TypeScript, ESLint, production build and whitespace checks pass.
- Provider operations use fixtures. No live gift offer, mandate, debit, cancellation or refund was issued.

## Release requirements

This phase is committed for Phase 6 release validation, not deployed. Apply the retained migration and verify gift flows end to end on the intended release environment. Live bank approval, monthly and annual renewals, both cancellation roles, lower-price reapproval, webhook cache invalidation, source cancellation outages and refunds remain release checks. The prior annual-plan enablement and storage-email configuration requirements still apply.
