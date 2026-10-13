# Payment Rules Phase 1 — Commercial Configuration

Baseline: payment-system-p5 at 9639be9f. Phase 0 local commit: ded83d60.
Status: local implementation and checks complete for commercial configuration/scheduling. Not deployed, not provider-live-certified, and not all 47 rules enforced yet.

## Implemented

- Published admin policy remains the source for student prices/names/features; no new hard-coded runtime annual fallback.
- Annual draft products: Striver INR 500 (50000 subunits), Ranker INR 1250 (125000 subunits); configurable independently from monthly price. Provider mapping validation and explicit publication required. Existing custom policies/contracts are preserved.
- New monthly/yearly mandate schedules: 1200 monthly or 100 annual cycles, using Razorpay's documented 100-year bound. Existing saved one-year contracts keep their original count/version; unverified old century-long setups remain blocked. Provider notifications remain enabled and cycle counts must match the saved contract.
- Student-wide permanent introductory-consumption ledger. A verified actual monthly introductory discount consumes both paid-plan offers. Refunds, cancelled purchases and delayed callbacks do not restore it. Quoted discounts, authorization tokens and successful full-price fallback do not consume it. Annual offers are blocked in admin save/publish and suppressed by server quote resolution.
- Checkout quote lifetime: 30 minutes, saved in the immutable checkout contract and sent as provider expire_by. Expired unpaid setups cannot resume at the old quote; UI offers a fresh price review. Authenticated/in-flight and paid evidence still reconciles normally.
- Admin availability choices: enabled, stop new purchases only, or retire and schedule stopping renewals. Checkout availability changes immediately; paid access is not removed. Audited retirement jobs retain paid expiry.
- Published price decreases schedule idempotent renewal-date jobs with ten-day approval grace. Existing provider price snapshots are not rewritten; increases never create repricing jobs. Superseded unpublished execution plans cannot silently charge a newer higher price. Admin can inspect queued transitions.

## What Phase 2 must execute before release

Commercial jobs are scheduling records, not completed provider operations. Price-decrease fresh-mandate approval, stopping old renewal, ten-day approval grace, plan-retirement cancellations, notifications, scheduled-publication jobs, and access projection require worker execution in Phase 2. Do not advertise pending jobs as applied and do not publish this intermediate branch as the full policy rollout.

Feature additions/reductions, storage handling, gifts and switching follow their subsequent phase gates. Existing long-running mandates cannot silently be stretched; any replacement needs approval.

## Validation

- Full repository suite: 1183 passed, 0 failed.
- Final focused commercial/introductory tests: 29 passed, 0 failed after the final cleanup.
- TypeScript check: passed.
- ESLint: passed with zero warnings.
- Next production build: passed.
- SQL migration tests cover annual defaults and existing policy preservation, repeated discount evidence/refunds, full-price fallback, and scheduled price-decrease idempotency.
- Retained migration ledger includes 0085, 0086 and 0087, preventing replay on a later deployment stage.

## Provider reference

Razorpay Create Subscription documentation, checked 13 October 2026:
https://razorpay.com/docs/api/payments/subscriptions/create-subscription/

A finite total_count/end_at is required; documented maximum duration is 100 years. No live provider writes, student charges, mandate modifications or file deletions were performed during this implementation.
