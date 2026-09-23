# Mobile rollout and rollback

## Promotion gates

1. Full repository CI and Mobile Phase 12 contract pass on the exact commit.
2. Retained D1 migrations and foreign keys pass in Cloudflare before the web deployment.
3. Signed artifacts are built only from the exact reviewed commit with protected environment secrets.
4. Android internal testing and iOS TestFlight complete the device matrix.
5. Expand through internal → closed/TestFlight → production staged rollout. Start production at the smallest store-supported cohort and expand only after crash, sign-in, API, sync and deletion metrics remain healthy.

## Rollback

- Hosted web/API regression: stop promotion and use the existing Cloudflare deployment rollback. Do not roll back D1 destructively.
- Native regression: halt the store rollout, keep the last compatible build supported in `config/app-release.ts`, fix forward and submit a higher build.
- Compatibility emergency: raise `recommended` first. Raise `minimumSupported` only for a security, corruption or incompatible-API issue and only after the replacement is approved in both stores.
- Account deletion failure: preserve the request/receipt evidence, retry through the idempotent queue and never mark completion before R2 and D1 deletion finish.

Store submission and rollout remain manual approvals because Apple/Google review, agreements and staged percentages are external irreversible release decisions. Ordinary hosted CA Progress features continue updating through Cloudflare automatically.
