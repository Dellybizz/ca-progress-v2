# Phase 2 Implementation Status

## Scope
Authentication, Profiles & Onboarding.

## Implementation status

**Phase 2 code/database implementation: COMPLETE.**

Provider-backed staging E2E remains intentionally open until the project owner supplies real Google OAuth and SMS-provider credentials.

## Implemented in code
- [x] Supabase SSR cookie session architecture using Next.js `proxy.ts` and verified `getClaims()` identity.
- [x] Google OAuth PKCE entry route and callback code exchange.
- [x] Phone OTP request/verify routes with application-level hashed phone/IP rate limiting.
- [x] Remember-this-device session behavior.
- [x] Local-only guest identity with no Supabase dependency.
- [x] Automatic auth-user profile + preference bootstrap trigger plus defensive callback bootstrap.
- [x] Four-step resumable onboarding wizard.
- [x] Database-backed attempt selector with a clearly non-academic placeholder until verified Phase 3 attempt data exists.
- [x] Private profile/settings page and avatar upload contract.
- [x] Private avatar storage bucket with own-folder RLS.
- [x] `optionalUser`, `requireUser`, safe return-path and post-auth destination helpers.
- [x] Restricted-feature login prompt preserves the intended destination.
- [x] Desktop/mobile Phase 1 design system preserved and extended.

## Live V2 database verification
- [x] `20260829215236 phase2_auth_profiles` applied to the isolated V2 Supabase project.
- [x] `20260829215825 phase2_auth_function_permissions` applied.
- [x] Profile/user-preference own-row policies remain intact.
- [x] Private `avatars` bucket has authenticated own-folder select/insert/update/delete policies.
- [x] OTP rate-limit table has RLS enabled and no client policies by design.
- [x] `handle_new_auth_user()` RPC execute permissions revoked from public/anon/authenticated roles.
- [x] Security advisor has no Phase 2 warning-level findings after hardening. Remaining RLS-with-no-policy notices are intentional service-role-only tables.
- [x] Performance advisor shows only expected unused-index informational notices because the new rate-limit table has not received production traffic yet.

## CI verification
Final verified Phase 2 branch run before provider setup: `33277443809`.

- [x] dependency install
- [x] TypeScript
- [x] ESLint
- [x] complete Phase 0 + 1 + 2 test suite
- [x] Next.js production build
- [x] OpenNext / Cloudflare dry-run

## External/manual dependencies
- [ ] Google OAuth client credentials entered into the V2 Supabase Google provider and tested end-to-end.
- [ ] Phone/SMS provider credentials entered into the V2 Supabase Phone provider and tested end-to-end.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configured as V2 Cloudflare Worker secret.
- [ ] `AUTH_RATE_LIMIT_SALT` configured as V2 Cloudflare Worker secret.
- [ ] V2 Auth Site URL and callback redirect allow-list confirmed in Supabase.

See `docs/AUTH_SETUP.md` for exact setup.

## Acceptance gate
- [ ] Google sign-in works end-to-end — **PENDING EXTERNAL PROVIDER SETUP**.
- [ ] Phone OTP works end-to-end with abuse/rate protection — **PENDING EXTERNAL PROVIDER + WORKER SECRET SETUP**.
- [x] Guest uses public/basic surfaces without persistent private data — verified by implementation boundary tests; guest module has no Supabase dependency.
- [x] First login is routed into onboarding until `onboarding_completed_at` is set, then skips it — verified by schema/routing/tests; provider E2E will reconfirm the complete browser journey.
- [x] Server identifies authenticated identity without client hydration — request-scoped SSR path uses `auth.getClaims()` in server/proxy code and passes TypeScript/build tests.

**Current Phase 2 acceptance result: 3/5 verified; 2/5 intentionally pending real provider credentials and staging E2E. Do not start Phase 3 until those external acceptance checks are completed.**
