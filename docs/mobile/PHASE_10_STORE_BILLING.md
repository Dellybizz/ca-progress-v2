# Mobile Phase 10 — Store-aware billing

Phase 10 preserves one account, one D1 entitlement model and the existing website Razorpay flow while creating a fail-closed boundary for future App Store and Play Store binaries.

## Implemented

- Native runtime identification uses the versioned `CAProgressNative/ios/<version>` or `CAProgressNative/android/<version>` user-agent contract reserved for the Phase 11 container.
- Website pricing continues using the existing server-authoritative Razorpay subscription flow.
- Native pricing is read-only: students can compare tiers and use entitlements already attached to their account, but Razorpay scripts, promo codes, external authorization fallbacks and purchase buttons are not rendered.
- Every browser payment-provider mutation route independently rejects a native runtime before reaching the private Billing Worker.
- Apple and Google store product slots are explicit and `null`; release configuration reports native checkout as not ready. The app cannot invent product IDs or claim store billing works.
- Existing subscriptions, payment history and entitlements remain in D1. Adding a store provider later must reconcile verified store transactions into this same entitlement authority rather than create a second account or feature matrix.

## Policy boundary verified on 23 September 2026

- Apple In-App Purchase: <https://developer.apple.com/in-app-purchase/>
- Google Play Payments policy: <https://support.google.com/googleplay/android-developer/answer/10281818>
- Google Play alternative billing in India requires programme enrolment and the required billing APIs: <https://support.google.com/googleplay/android-developer/answer/12570971>

CA Progress does not assume that an India-specific alternative-billing option automatically authorizes Razorpay in a Play-distributed build. That path remains disabled until enrolment, API integration, reporting and review requirements are implemented and verified.

## Phase 11 hand-off

Phase 11 may create the Capacitor projects, choose final bundle/package identifiers, configure approved store products, implement StoreKit and Google Play Billing bridges, verify signed transactions server-side, add restore-purchases behavior, and prepare store submissions. Until all of those are present, native checkout remains unavailable by design.

Run `npm run test:mobile:phase10`, followed by the complete CI command. No D1 migration is required for Phase 10.
