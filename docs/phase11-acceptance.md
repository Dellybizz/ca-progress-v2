# Phase 11 Acceptance — Plans, Entitlements, Billing & Razorpay

Source of truth: CA Progress V2 detailed phased plan, Phase 11 only.

## Scope implemented

- `/pricing` with Free, Basic and Pro, monthly/annual paid variants, upgrade messaging, configuration-safe checkout states, loading and error states.
- `/billing` with current plan, validity, active-until, renewal state, payment history, subscription audit, empty state, success/pending/failure/retry recovery states.
- `/api/payments/create-order`, `/api/payments/verify`, `/api/payments/webhook`.
- Separate private Cloudflare billing Worker (`ca-progress-v2-billing`) reached through `BILLING_SERVICE`.
- Server/database entitlement helpers and integrations for protected Phase 11 features.
- Aggregate private-resource storage quota architecture integrated with the existing Phase 7 R2 upload path.
- Auditable payment and subscription events.

## Commercial configuration policy

The detailed Phase 11 plan does not approve numeric Basic/Pro prices. Paid rows therefore keep `price_subunits = NULL` and `checkout_enabled = false` until approved staging values and Razorpay secrets are configured server-side.

The plan also does not approve numeric Free/Basic/Pro aggregate storage allowances. The forward hardening migration marks `resources.storage` allowances `configured = false` with no numeric limit. The secure Phase 7 per-file validation/private R2 architecture remains intact; the atomic aggregate quota path becomes effective as soon as approved numeric allowances are configured.

## Security and correctness evidence

### 1. No hardcoded `+1 month` subscription logic — PASS

`subscription_plans` stores `duration_value` and `duration_unit`. `phase11_add_plan_duration` applies the configured day/week/month/year/lifetime definition. Reconciliation calls the helper rather than adding a hardcoded month.

### 2. Client cannot choose arbitrary amount or grant itself a plan — PASS

The browser sends only `planId`. The private billing Worker loads the selected active/checkout-enabled plan from Supabase and uses its server-side amount/currency for the Razorpay order and local `payment_orders` row. Browser roles have no mutation policies/grants for protected payment/subscription tables or reconciliation functions.

### 3. Duplicate verify/webhook delivery cannot duplicate entitlement — PASS

Payment reconciliation locks the local order, de-duplicates provider event keys, checks for an existing purchased entitlement by Razorpay source order, and preserves unique source-order constraints. Verify and webhook may both describe the same payment without creating two grants.

### 4. Expired paid plans lose protected access on server — PASS

`phase11_current_plan_id` considers only active subscriptions whose `starts_at <= now()` and whose `ends_at` is null or greater than `now()`. Expired paid periods therefore fall back to the active Free plan before entitlement resolution.

## Additional Phase 11 verification

- Explicit Free / Basic / Pro architecture — PASS.
- Basic and Pro monthly/annual rows — PASS.
- Current subscription resolution and safe same-tier extension from existing valid expiry — PASS.
- Razorpay checkout signature verification — PASS.
- Provider API payment verification — PASS.
- Order ID, payment ownership, amount, currency and provider status verification — PASS.
- Signed raw-body webhook verification before event parsing — PASS.
- Independent webhook reconciliation — PASS.
- Payment/subscription audit events retained — PASS.
- Server-side entitlement helpers used as security boundary; UI locks are display-only — PASS.
- Phase 7 private R2 storage architecture preserved — PASS.
- Responsive pricing/billing layouts and route loading/error/empty states — PASS.
- Earlier phase regression suites remain part of the full test command — PASS subject to final CI.

## Final verification gate

Do not mark Phase 11 complete or merge until PR CI passes typecheck, lint, automated tests, Next.js build and Cloudflare/OpenNext checks. Staging deployment must then be verified without enabling paid checkout until approved prices and Razorpay staging secrets exist.
