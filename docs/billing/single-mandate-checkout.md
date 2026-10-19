# Single-mandate first-month checkout

New direct monthly Basic and Pro purchases can use one subscription checkout when an operator binds a live Razorpay Subscription Offer. The regular provider plan is used from the beginning; `offer_id` discounts exactly the first billing cycle. There is no separate order, replacement subscription, or second renewal approval.

## Provider setup still required

Create Subscription Offers in Razorpay Live Mode, with the chosen validation-failure behavior explicitly disclosed at checkout:

| Plan | Method | Regular monthly price | First-month price | Flat discount | Offer duration |
| --- | --- | --- | --- | --- | --- |
| Basic | UPI | ₹50 | ₹25 | ₹25 | One cycle |
| Pro | UPI | ₹150 | ₹50 | ₹100 | One cycle |
| Basic | Card | ₹50 | ₹25 | ₹25 | One cycle |
| Pro | Card | ₹150 | ₹50 | ₹100 | One cycle |

These values describe the current configuration. Use the configured regular and introductory prices if prices change. Minimum qualifying amount equals the regular plan price. Avoid bank, network, IIN and customer restrictions that would exclude eligible buyers. Store a dashboard evidence reference for the settings and live Offer ID.

In CA Progress, open Admin → Plans → Pricing Versions → the current published monthly policy → Single-checkout first-month offer. Bind each method's Offer ID separately. Existing UPI-only historical attestation is deliberately not migrated into this feature without renewed operator review.

Razorpay's documented Subscription Offer methods are UPI and card. eMandate remains on the existing independent discounted-payment flow; it is not advertised as supporting a one-mandate introductory offer.

## Activation and recovery

Checkout loads Razorpay ahead of time and keeps the plan review visible while setup is prepared. Closing the provider window acknowledges the closure immediately; a new payment still waits for confirmed cancellation of the old setup. Payment callbacks show confirmation progress immediately and update the selected plan from the verification response, without running a second full reconciliation or waiting for a Billing-page navigation. Pending status reads accelerate for a bounded window; provider recovery requests remain throttled.

Checkout may reuse a provider-verified Plan snapshot for five minutes only when the provider key, Plan ID, currency, amount and billing frequency exactly match. Missing, expired or changed snapshots require a live GET. Admin verification always performs a fresh read. This cache contains no payment or entitlement evidence. Signed callback verification reads the subscription under its existing projection lease and reuses its freshly provider-read payment for the matching invoice; other invoice payments still require provider reads.

The server checks first-paid-purchase eligibility, binding policy, method, currency, introductory price and recurring price. A stale binding or changed eligibility aborts preparation before provider subscription creation. Trial and non-monthly interval combinations are not enabled by this feature. Existing payment contracts and already-paid first months retain their original recovery paths.

Access requires captured invoice evidence at the exact discounted amount, or the exact regular first-month amount when the saved checkout includes explicit customer acceptance of that fallback. Arbitrary amounts and unconsented full-price charges remain blocked. Cycle two and later require the regular amount on the same provider subscription. Bank authorization alone does not grant paid access.

Closing an unactivated mandate checkout requests provider-confirmed cancellation. If payment evidence exists or cancellation cannot be verified, the checkout remains under reconciliation and verified access is preserved.

Migration 0080 activates the operator-supplied live Basic UPI offer `offer_TmiyM56nUFR5PJ` only when the current published policy is ₹50/month with a ₹25 introductory purchase. It aborts if those terms differ. The operator created the offer in the Razorpay dashboard and requested activation; Razorpay still validates the offer at checkout, and access still requires exact captured invoice evidence. Existing contracts are unchanged. Migration 0081 activates Pro UPI offer `offer_Tmm4dnEyOmuBaO` at ₹50 first month / ₹150 monthly and enables the operator-requested regular-price fallback for both UPI offers. Fresh checkouts require customer acceptance of the possible full-price first month. Card bindings still require their own live offers.

Striver → Ranker switching now uses the same subscription checkout as initial purchases. The replacement starts immediately, with the first-month offer when eligible, and then regular monthly renewals. No one-time order or separate renewal approval is created for this path. The switch ledger binds the old mandate, target plan and immutable request. The old mandate is retained on dismissal, authorization-only callbacks, failed payments or financial mismatches. A captured, invoice-backed replacement payment permits retiring the old renewal; a lease and five-minute maintenance protect retries. A verified old debit paid after the replacement payment is compensated through a separate idempotent refund ledger, without crediting earlier paid Striver periods.
