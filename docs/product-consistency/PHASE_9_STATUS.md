# Product Consistency Phase 9 — Granular plans, pricing and entitlements

Status: implemented; production deployment is required before completion.

## Delivered

- Versioned Plan → Page → Feature policies with access, quantity, time, storage, file-size, reset and retention rules.
- Admin draft duplication, editing, dependency validation, publishing and rollback.
- Published prices, billing duration, trials, grace, effective dates and safe pricing-cache invalidation.
- Existing subscriptions are grandfathered onto the policy active before migration; new payment orders snapshot their exact price, duration and policy.
- Canonical Billing Worker evaluation covers page/feature policies, temporary promotions, per-user overrides, paid-through cancellation, grace and scheduled plan changes.
- Atomic, idempotent usage reservations prevent concurrent quota bypass.
- Student usage meters and admin “View as plan” filtering.
- Downgrades change access only; no user content or uploaded object is deleted.

## Compatibility

Existing Free ₹0 / 250 MB, Pro ₹50 / 2.5 GB and Premium ₹150 / 15 GB definitions become published version 1 policies. Existing plan, subscription, payment and entitlement identifiers remain unchanged.
