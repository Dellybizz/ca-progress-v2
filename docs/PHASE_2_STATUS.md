# Phase 2 Implementation Status

## Scope
Authentication, Profiles & Onboarding.

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

## External/manual dependencies
- [ ] Google OAuth client credentials entered into the V2 Supabase Google provider and tested end-to-end.
- [ ] Phone/SMS provider credentials entered into the V2 Supabase Phone provider and tested end-to-end.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configured as V2 Cloudflare Worker secret.
- [ ] `AUTH_RATE_LIMIT_SALT` configured as V2 Cloudflare Worker secret.
- [ ] V2 Auth Site URL and callback redirect allow-list confirmed in Supabase.

See `docs/AUTH_SETUP.md` for exact setup.

## Acceptance gate
- [ ] Google sign-in works end-to-end — requires external Google/Supabase provider credentials.
- [ ] Phone OTP works end-to-end with abuse/rate protection — requires external SMS provider credentials and Worker secrets.
- [ ] Guest can use public/basic surfaces without persistent private data.
- [ ] First login enters onboarding exactly once unless incomplete.
- [ ] Server can identify an authenticated user without waiting for client hydration.

The last three acceptance checks can be closed from code/database/CI verification. The first two must not be marked passed until real provider credentials are configured and an actual staging E2E flow succeeds.
