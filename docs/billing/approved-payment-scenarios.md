# CA Progress — Payment Scenario Decisions

Updated: 13 October 2026, 02:36 IST.
Status: decision record only; this file does not establish implementation or deployment completion.
Source: user answers in this conversation plus explicitly identified retrieved decisions from 12 October.

## Previously agreed baseline

- Plan names: Explorer, Striver, Ranker.
- Admin pricing/subscription details must appear dynamically in the UI.
- Switching paid plans uses subscription AutoPay, not one-time payment.
- Retrieved current introductory Ranker quote: ₹50 when eligible, then ₹150/month. Normal fallback: Striver ₹50 / Ranker ₹150. These are historical quotes, not immutable admin configuration.
- Original uncertain payment eventually succeeds: grant subscription. Unknown status: allow retry.
- Both attempts succeed: activate once and fully refund duplicate; CA Progress absorbs unrecovered gateway fees.
- Overlapping different-plan purchases: latest chosen successful plan retained; other fully refunded and renewal stopped.
- Failed duplicate refund: valid subscription stays active, refund remains pending and safely retried; alert admin after 24 hours.

## Confirmed scenarios

### 1. Allow immediate payment-method changes during uncertain-payment retries; methods must support AutoPay.

### 2. Retain latest successful attempt's AutoPay mandate. Cancel and fully refund earlier duplicate.

### 3. Failed renewal: three-day paid-feature grace, then Explorer if unpaid. Preserve study data subject to the separately agreed file-storage cleanup.

### 4. Payment recovered during grace: original renewal date remains; grace days count toward the month.

### 5. Cancellation mid-paid-period: stop future renewals; keep paid access until paid expiry.

### 6. Ranker to Striver downgrade: next renewal; retain Ranker until then.

### 7. Storage cleanup: normal files deleted first. Existing important-marked files have the new plan's storage limit +10% allowance; delete excess. User wording: 'normal files first important marked files get current plan +10% grace for already uploaded files and exceeding files deleted'. Subsequent questions explicitly used new-plan limit +10%, accepted by user.

### 8. Normal-file deletion order: least recently opened first.

### 9. Important-file deletion order if above allowance: largest first.

### 10. During seven-day cleanup period, block new uploads while above normal new-plan limit; allow existing-file viewing, downloading, deletion. Resume uploads below normal limit.

### 11. Verified upgrade providing sufficient storage before cleanup: cancel cleanup, retain files, restore uploads.

### 12. Same seven-day cleanup applies to Explorer after cancellation expiry or failed-renewal grace expiry.

### 13. Admin price increases: active subscribers keep existing price; new subscriptions use new price.

### 14. Admin price decreases: existing subscribers get lower price at next renewal; fresh AutoPay approval if required.

### 15. Admin feature/storage edits: additions immediately; reductions at next renewal with warning. Cleanup starts when reduced limit takes effect.

### 16. Introductory offer once per student across all paid plans.

### 17. Successful discounted payment permanently consumes introductory eligibility, even if fully refunded.

### 18. Late recovery after grace: count grace and remaining days toward next date. Interpreted and recorded in conversation as retaining original billing schedule; no fresh full month from late success.

### 19. Striver to Ranker: immediate after verified payment, new monthly period, no unused-Striver credit; stop old renewal after verification.

### 20. Reverse scheduled downgrade: cancel downgrade, retain Ranker and existing schedule, no immediate charge.

### 21. Reactivate cancellation before paid expiry: preserve paid days; restore renewal or fresh AutoPay approval, charge at existing expiry.

### 22. Cancel during failed-renewal grace: end grace immediately, Explorer, stop further collection attempts.

### 23. Renewal already processing succeeds after cancellation during grace: full refund, stay cancelled and Explorer.

### 24. Disable plan: admin chooses stop new purchases only OR retire and stop renewals. Corrected by user from B to C. Retirement preserves paid access until expiry.

### 25. Admin price changes while checkout open: honour quoted price; new checkouts use new price.

### 26. Unpaid checkout quote valid for 30 minutes; after expiry refresh pricing. Already-processing payments still reconciled.

### 27. Full-price fallback when offer fails does NOT consume introductory eligibility.

### Storage cleanup timing (follow-up to scenario 7)

Seven days after downgrade takes effect, with advance warnings and opportunity to download or reduce storage. The +10% is storage headroom for existing important files, not additional time or new-upload allowance.

## Additional confirmed scenarios

### 28. Renewal reminders

Notify immediately on failure, then once daily, including a final warning before grace ends. Stop after payment success or cancellation.

### 29. Recovery after monthly grace

After three unpaid days, move to Explorer and continue renewal recovery for seven more days. Stop further collection attempts after that; reconcile in-flight payments.

### 30. Payment after covered period fully ended

Apply the payment to the expired billing period. No refund and no new paid access. This is the explicit user choice C.

### 31. Price-decrease mandate not approved

Stop old renewal. Request fresh approval and allow TEN days of paid-access grace, then Explorer if unpaid. This exception overrides normal monthly three-day grace.

### 32. Downgrade mandate prerequisite

Only schedule/apply a downgrade after the student completes the new UPI AutoPay mandate during the downgrade flow. Without approval, current plan and renewal remain unchanged. Effective downgrade date remains next renewal.

### 33. Routine purchase refunds

No routine refunds for correct purchases with delivered access. Cancellation stops future renewals; paid access continues until expiry. Previously agreed duplicate/late-after-cancellation refunds still apply.

### 34. Recurring gifts

Support gifted subscriptions; purchaser approves recurring AutoPay for recipient.

### 35. Gift eligibility

Allow gifts for students on a lower plan. Same-plan or lower-plan gifts are blocked. Explorer is lower than both paid plans.

### 36. Gift activation

Higher-plan gift starts immediately after recipient acceptance and verified payment. Stop recipient previous renewal, with no unused-time credit.

### 37. Gift introductory discount

No introductory discounts on gifts; normal price applies.

### 38. Billing periods

Monthly AutoPay and yearly AutoPay, both intended to renew continuously until cancelled. Yearly charges once per year. This supersedes earlier one-year prepaid/no-renewal and lifetime-access suggestions. Forever means ongoing renewals, not one payment for lifetime access; provider duration limits must be handled transparently rather than promised away.

### 39. Annual pricing

Admin-set independent prices: Striver INR 500/year and Ranker INR 1250/year. These are initial configured values; not 12 times the monthly price.

### 40. Annual introductory offers

Monthly introductory offers only. Annual subscriptions start at normal annual price.

### 41. Switch billing frequency

Same-plan monthly-to-yearly or yearly-to-monthly switches start immediately after mandate approval and verified payment. Charge the new period, no unused-time credit, stop previous renewal.

### 42. Failed annual renewal

TEN days of paid-access grace, then Explorer. Continue recovery for seven more days. Annual exception overrides normal monthly three-day grace.

### 43. Bank offer stacking

Allow bank/card offers together with introductory discount where supported by the payment provider.

### 44. Cleanup warnings

Persistent in-app warning and email when cleanup scheduled, three days before deletion, and one day before deletion.

### 45. Deletion permanence

Permanently delete excess files after seven-day warning period; no recovery bin.

### 46. Important markings during cleanup

Allow marking already uploaded files important during warning period. Use latest markings at cleanup, subject to new-plan limit plus 10 percent; excess important files deleted largest first.

### 47. Gift cancellation authority

Both purchaser and recipient can stop future gift renewals. Paid recipient access continues until expiry.

## Configuration precedence and handoff

Treat this file as the approved business-rule reference for future CA Progress payment configuration. Read the complete current version before changes. New explicitly approved decisions supersede older rules; record amendments here.

- Monthly failed-renewal grace: 3 days; yearly: 10 days; price-decrease approval exception: 10 days.
- Recovery attempts after ordinary monthly/yearly grace: 7 additional days, without paid access.
- Intro offers: once per student across paid plans; successful discounted payment consumes permanently, including after refund. Full-price fallback preserves eligibility. Annual and gifted subscriptions have no introductory discounts.
- Plan retirement is an admin choice, not an automatic stop-renewal rule for every disabled plan.
- Downgrades require completed new mandate before scheduling and take effect at next renewal. Upgrades and billing-frequency switches charge/start immediately, no credit, old renewal stopped after verified payment.
- Seven-day storage warning begins when lower limit actually takes effect. Normal files: least recently opened first. Important existing files: new-plan limit +10%, excess largest first. New uploads use normal limit, not +10%.
- Permanent file deletion is an approved policy; this record itself does not execute deletion.

## Status and boundaries

47 numbered scenarios and the storage-cleanup timing follow-up are recorded. The planned questionnaire is complete. This is an approved decision record, not evidence that code, Razorpay configuration, deployment, or public sharing has been completed.

Unspecified implementation details must not be presented as user-approved: deterministic tie-breaking for equally sized/unopened files; whether normal and important file storage share a single pool; exact provider retry cadence; special 10-day price-decrease recovery after grace; billing-period anchoring across gift variants. Resolve only when implementation needs them. Provider capabilities must be verified during implementation.

Preserve final corrections: scenario 24 C; scenario 25 A; scenario 27 A. Scenario 31 custom B with ten-day grace; scenario 32 custom mandate prerequisite; scenario 35 lower-plan recipients; scenario 38 superseded by monthly AND yearly recurring AutoPay.
