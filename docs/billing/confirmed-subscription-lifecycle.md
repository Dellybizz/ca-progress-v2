# Confirmed subscription lifecycle, 11 October 2026

This is the implementation contract, not a claim that every flow is live.

## Accepted decisions

- Prices, storage, grace and offer rules resolve from versioned policies. Preserve existing paid-period contracts.
- Basic introductory price 25 INR; Pro introductory price 50 INR. Recurring prices remain published plan prices (currently 50/150 INR). Eligibility is first verified paid purchase per tier, independent across tiers. Manual grants never consume introductory offers. Payment-method scope for the new Pro offer remains undecided.
- Upgrade immediately after verified payment. Normal upgrade: target price prorated to remaining verified paid period minus actual unused payment credit; retain renewal date. Eligible Pro offer: a full calendar month at intro price minus unused actual Basic payment; reset renewal date. Popup displays amounts, credit, period, next charge and renewal date.
- Downgrade at renewal. Free stops renewal while preserving already-paid and valid grant access. Schedule even over quota with warning. Current storage features continue until effective date.
- Undo scheduled downgrade from Pricing with no additional charge.
- Pending purchase or upgrade can be retried. One verified captured payment wins per purchase group. Refund every later captured duplicate via durable idempotent refund obligations. Only one continuing recurring subscription. Preserve old plan during unverified upgrade.
- Failed renewal access grace: three days anchored to paid-through date, not retries.
- Storage cleanup grace: ten days after downgrade or unpaid-period end. During grace allow downloads, deletion and importance changes; restrict excess uploads after new limit becomes effective. Important files alone may occupy additional ten percent of the target plan limit. Delete newest unmarked first; excess important newest last; stop once usage fits. Warn and provide deadline before deletion. Valid grants override lower limits until expiry.
- Preserve saved premium work; disable unavailable actions, restore on upgrade.
- New admin grants require claim and notification. Claim pauses paid remaining time; extends provider renewal by grant duration; applies to same-tier grants too. Legacy grants retain existing terms.
- Lower-tier grants saved for manual activation later. Admin chooses duration, claim-by deadline or no expiry, audience everyone or never-claimed. Previous unclaimed offers do not disqualify recipients. Universal claimed grants queue after active grant; do not overlap credited time.
- Remind before bank mandate authorization ends. Never remove already-paid/granted access for lack of future authorization.
- Continue subscription from Pricing after cancellation, preserving paid time, new bank approval only if needed, no duplicate mandates.
- Price lock: twelve calendar months from activation; a plan switch starts a new lock when effective. Intro offer duration unchanged. Price increase notice duration remains undecided.

## Delivery status

Implemented and tested in this change:
- Pure exact quote/credit calculations, calendar-month locks, grant scheduling, per-tier eligibility, deterministic storage cleanup preview and verified duplicate-payment disposition.
- Additive policy and durable purchase/refund/grant/storage records, with no destructive cleanup activated.
- Owner-only resource importance marking.
- Cancel a scheduled provider plan change from Pricing, with provider confirmation before clearing the local scheduled state.

Upgrade integration in this release:
- Authenticated five-minute server quote snapshots, published configurable Pro first-upgrade-month price (50 INR), independent paid-Pro eligibility, actual captured Basic credit, and original quote/period ownership checks.
- Pricing review with full-month intro versus remaining-period proration, credit, exact due, renewal date/price, and bank approval method. Prominent first-upgrade-month offer for eligible Basic subscribers; full comparison preserved.
- Separate Razorpay upgrade Order settlement: immutable quote validation, captured payment verification, atomic winner/access grant, exact fixed dates and repeat-safe audit history. Late duplicate captured upgrade payments create idempotent refund obligations.
- Preserve Basic before successful payment. Cancel its provider renewal only after verified Pro activation; create replacement authorization only after fresh confirmed cancellation. Save/recover uncertain creation without repeating possibly dispatched requests. Approved replacement starts on the quoted renewal date at the agreed recurring price.
- Paid Pro survives interrupted future authorization; Pricing and Billing provide a saved continuation. Regular renewals continue through the existing invoice verifier. Upgrade payments/refund status appear in Billing.
- Signed late old-mandate renewal captures are verified and queued for refund instead of extending overlapping Basic access. Refund/dispute holds remove only the affected upgrade access and remain visible for review.

This release covers Basic-to-Pro upgrades and direct introductory Pro purchases. Eligible direct Pro buyers pay the published first-month amount through a verified Order, receive a full calendar month from payment verification, then authorize future recurring payments at the saved regular price. Existing unresolved recurring checkouts must be recovered first; ordinary repeat Pro subscriptions continue through the existing recurring checkout. Payment retries/refunds here cover upgrade Orders; the general checkout retry-group replacement is still pending. Quotes below the gateway's one-rupee minimum require renewal rather than silently increasing the charge or discarding credit. No real customer payments/cancellations/refunds were performed for testing.

Remaining integration work (must not be represented as live):
- Retry groups and captured-payment arbitration in verification/webhook/queue paths; idempotent duplicate refunds and duplicate mandate closure.
- General fresh checkout retry groups across all payment flows (direct introductory Orders currently resume the same saved Order).
- Admin grant issuance UI, student claim/notification UI, atomic queued activation and verified provider schedule extension.
- Storage transition creation, reminder delivery, protected cleanup worker covering resources and test attachments; grace upload allowance and importance marking for attachments.
- Persisted one-year lock enforcement, future reauthorization and continuation flow.

## Release requirements

Never activate new monetary paths based on browser calculations. Fresh provider proof must match owner, purchase, amount, currency and immutable quote. A database claim decides the winner atomically. Before retrying an uncertain refund, fetch by its stable idempotency key. Access activation and competing mandate closure must reconcile independently. Cleanup must recheck effective entitlement, current importance, current usage, current transition and lease at execution; if entitlement lookup fails, do not delete. Storage reservations count toward upload limits. No automatic deletion before deadline and delivered warnings.
