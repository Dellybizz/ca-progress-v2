# Phase 3 — Mandates and automatic renewals

## Implementation

New authorizations have a deliberate one-year limit: 12 monthly charges or one annual charge, divided by a compatible published billing interval. The first charge counts toward this limit. Checkout and quote disclose the count, recurring price, cancellation, provider notifications and fresh authorization at the end. Annual sales remain disabled until their commercial policy is ready. Existing subscription IDs, consent, provider plans and original total counts remain intact; long legacy mandates display their saved limit and observed provider end date. A new published commercial price does not change existing contracts.

Razorpay Subscriptions executes scheduled debits, retries and notifications while the browser/app is closed. CA Progress performs provider reads and access reconciliation. No cron, queue or renewal code independently captures a payment, charges a saved instrument or switches an introductory plan to a full-price plan. UPI introductory/campaign offers remain on the same recurring plan; Card/eMandate use regular prices.

The renewal reconciler reads provider invoices and captured payments. Invoice ownership, payment/invoice IDs, selected method, stable plan/offer, amount, currency and service dates must agree with the original contract. Discount eligibility follows the original invoice's cycle number, never today's mutable paid count. Provider invoice service dates define access; an unpaid later invoice's end date cannot extend access. Each invoice and payment has a unique ledger identity. Replayed first-cycle callbacks continue to verify their original price after a full-price renewal.

Authorization transactions without a captured service invoice do not grant paid access or invent a trial. Only explicitly configured trials can follow the existing trial policy; current Basic/Pro policies use zero trial days. Provider read failures, mismatched amounts and missing captured invoices stay pending. They preserve the last verified paid period and withhold unverified extensions. The billing screen exposes this state. Reconciliation uses UTC comparisons that work for ISO timestamps and displays billing dates in IST.

Phase 4 still owns comprehensive durable inbox replay, reordered-event/outbox convergence and cache certification. Phase 5 owns the complete recovery/grace/reminder matrix. Refunds, store billing and boundary-safe plan replacements remain their respective later phases.

## Verification and release

The repository adds deterministic provider/SQLite tests for first discounted and next full invoices, callback signature validation, missing optional payment fields, authorization-only states, unavailable or uncaptured evidence, amount/currency/method drift, duplicate cycles, replay, provider retry, campaign boundaries and calendar/leap-year service periods. Compiled private-worker tests verify actual access projection without a browser callback and ensure no independent provider debit is made.

The release applies migration 0071 before Billing Worker deployment. Live checks verify the cycle ledger, new consent fields, finite mandate quote disclosure and absence of duplicate cycles. A read-only collector inspects existing provider subscriptions/invoices/payments and reports actual first-and-next-cycle evidence separately from implementation checks. It never creates or pays a live checkout and exports only aggregate counts and commercial terms.

## Certification rule

The original payment plan requires: “Supported-method evidence demonstrates first discounted charge and next full cycle; no independent cron debit.” A created subscription or a mocked provider is not live renewal proof. Successful code deployment must not be labeled full Phase 3 completion until that evidence exists for every launched path.

For an eligible Basic UPI test account, the required live evidence is ₹25 captured for the first service invoice and ₹50 captured for the next invoice on the same ₹50 recurring plan and original Subscription Offer. For regular Basic Card/eMandate, verify ₹50 then ₹50. For Pro, verify ₹150 then ₹150 for each launched method. The customer must authorize each bank mandate. Test-mode accelerated cycles can prove gateway integration but cannot substitute for a real live monthly/yearly renewal.

## Release record

Implementation deployed successfully from commit `3f0ee92f5532e5ebfdf1afc5724c26ca5ebac5c2` on 30 September 2026 UTC (1 October IST). Release: https://github.com/Dellybizz/ca-progress-v2/actions/runs/36756700392.

All 963 tests, repository CI and Cloudflare runtime build passed. Migration 0071 was applied before deployment. Billing version: `78184cd1-e4fd-4cc9-a50c-13f93e7b7617`; web version: `e3afc523-d1be-4325-908a-62ad9e26b02b`. Live renewal-schema checks and 12 finite-mandate quote checks passed. Private checkout/recovery authentication checks passed, with zero duplicate access rows.

Certification remains `awaiting_real_authorization_and_renewal_proof`: zero real first-and-next-cycle paths were proven. The read-only collector performed zero live mutations. Bank-authorized first and subsequent captured service invoices for every launched method are still required for full Phase 3 completion.

## Official implementation references

- https://razorpay.com/docs/api/payments/subscriptions/create-subscription/
- https://razorpay.com/docs/api/payments/subscriptions/fetch-invoices/
- https://razorpay.com/docs/api/payments/entity/
- https://razorpay.com/docs/payments/subscriptions/test/

Checked 30 September 2026. Real payment objects need not repeat subscription_id: their invoice_id is matched to a verified subscription invoice. Signed authorization callbacks also bind the payment ID to the server-owned subscription.
