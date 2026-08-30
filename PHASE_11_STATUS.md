# CA Progress V2 — Phase 11 Status

**Phase:** 11 — Plans, Entitlements, Billing & Razorpay  
**Branch:** `phase-11-plans-entitlements-billing-razorpay`  
**Scope boundary:** Phase 11 only. Phase 12 has not been started.

## Implemented

- Normalized plans, entitlements, subscriptions, payment orders, payment events and subscription events.
- Explicit plan duration model (`duration_value`, `duration_unit`) with safe extension behavior.
- Free, Basic and Pro plan architecture; Basic/Pro monthly and annual variants.
- Server-side entitlement resolution with expired paid-plan fallback to Free.
- Responsive Pricing and Billing surfaces with loading/error/empty/payment recovery states.
- Razorpay server order creation, checkout verification, provider API verification and signed webhook reconciliation.
- Idempotent payment/subscription reconciliation and retained audit events.
- Phase 11 feature gates and aggregate resource-storage enforcement integrated with existing V2 services.
- Separate private Cloudflare billing Worker and web-worker service binding.
- Automated Phase 11 security, payment and route/responsive tests.

## Configuration intentionally not invented

- Basic/Pro prices remain `NULL` and paid checkout remains disabled until approved server-side prices are configured.
- Numeric aggregate storage allowances remain unconfigured because the Phase 11 source plan provides no approved values. The quota architecture is installed without fabricating Free/Basic/Pro limits.

## Required manual staging configuration before paid checkout can be enabled

Configure these as secrets on the private billing Worker, not in Git or browser code:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Then configure approved Basic/Pro prices in V2 Supabase and explicitly enable checkout for the relevant plan rows. Configure approved numeric `resources.storage` allowances before relying on aggregate plan storage limits.

## Completion gate

Phase 11 is complete only after PR CI passes and the resulting V2 staging deployment is verified. The legacy CA Progress repository, legacy deployment and old Supabase project must remain untouched.
