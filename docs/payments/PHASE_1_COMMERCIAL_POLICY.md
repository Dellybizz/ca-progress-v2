# Payment System Phase 1 — Commercial policy

Baseline: payment-system-p0 at 8e216f8e8dbabd4873faccb6c58e3fa271c1ed3a.

## Behavior

The canonical commercial labels are Free, Basic (currently ₹50/month), and Pro (currently ₹150/month). Amounts at checkout come from the effective versioned D1 policy. Existing subscriptions keep their policy ID, first-charge amount, recurring amount, and offer; publication does not rewrite them.

Pricing quotes depend on UPI AutoPay, Card, or eMandate. The eligible ₹25 introductory price is UPI-only. Card/eMandate start at ₹50 for Basic. Returning customers use regular pricing. Trial quotes distinguish payment due today from the first scheduled charge. Bank compatibility remains subject to Razorpay authorisation.

Requests pin the displayed policy version. A version change rejects checkout and asks the student to refresh. An unresolved pending subscription is never silently converted to a new policy or payment method. Authoritative response amounts must match the displayed quote before checkout opens.

## Admin flow

1. Create a draft from the current effective policy.
2. Edit recurring amount, interval, access, introductory terms, cancellation and grace terms.
3. Review student preview, diff and existing-contract impact.
4. Validate / provision the recurring Razorpay mapping. Provider ID, amount, currency, period and interval must match the policy.
5. For an introductory policy, record the dashboard evidence reference and confirm UPI only, expected flat discount, minimum amount, one redemption and block on offer failure. This is explicitly dashboard attestation, not a successful Offer GET or bank-authorisation proof. Razorpay must enforce the bound Offer at authorisation. Changes to offer terms invalidate this evidence.
6. Publish now or schedule a future effective time. Publication rejects missing/mismatched mappings or stale offer evidence. Retired versions may be restored after the same validation.

The P1 deployment validates effective mappings and provisions missing recurring mappings, including Pro. It never publishes policies, changes student subscriptions, or grants access. Provider failures stop release.

## Verification and status

Local verification and live release results are reported separately. Phase 1 is not certified live until its release workflow, mapping evidence and deployed pricing checks pass. Renewal execution, mandate duration/end-date correction, payment captures and native store billing remain outside this phase.
