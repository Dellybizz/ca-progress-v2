# Single-mandate first-month checkout

New direct monthly Basic and Pro purchases can use one subscription checkout when an operator binds a live Razorpay Subscription Offer. The regular provider plan is used from the beginning; `offer_id` discounts exactly the first billing cycle. There is no separate order, replacement subscription, or second renewal approval.

## Provider setup still required

Create Subscription Offers in Razorpay Live Mode, with payment blocked when offer validation fails:

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

The server checks first-paid-purchase eligibility, binding policy, method, currency, introductory price and recurring price. A stale binding or changed eligibility aborts preparation before provider subscription creation. Trial and non-monthly interval combinations are not enabled by this feature. Existing payment contracts and already-paid first months retain their original recovery paths.

Access requires captured invoice evidence at the exact discounted amount. Cycle two and later require the regular amount on the same provider subscription. Bank authorization alone does not grant paid access.

Closing an unactivated mandate checkout requests provider-confirmed cancellation. If payment evidence exists or cancellation cannot be verified, the checkout remains under reconciliation and verified access is preserved.

Migration 0080 activates the operator-supplied live Basic UPI offer `offer_TmiyM56nUFR5PJ` only when the current published policy is ₹50/month with a ₹25 introductory purchase. It aborts if those terms differ. The operator created the offer in the Razorpay dashboard and requested activation; Razorpay still validates the offer at checkout, and access still requires exact captured invoice evidence. Existing contracts are unchanged. Pro and card bindings still require their own live offers.
