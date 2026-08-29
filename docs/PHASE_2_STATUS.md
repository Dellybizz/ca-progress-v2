# Phase 2 Implementation Status

## Scope
Authentication, Profiles & Onboarding.

## Implementation status

**Phase 2: COMPLETE.**

The active authentication choice was revised by the project owner from Google + phone OTP to **Google + LinkedIn (OIDC)**. Guest mode remains available. Google and LinkedIn provider-backed staging E2E have now been completed successfully against the isolated V2 Supabase project and Cloudflare staging deployment.

## Implemented in code
- [x] Supabase SSR cookie session architecture using Next.js `proxy.ts` and verified `getClaims()` identity.
- [x] Google OAuth PKCE entry route and callback code exchange.
- [x] LinkedIn (OIDC) OAuth PKCE entry route using the same secure callback exchange.
- [x] Phone OTP UI/API/rate-limit code retired from the active product.
- [x] Remember-this-device session behavior for OAuth.
- [x] Local-only guest identity with no Supabase dependency.
- [x] Automatic auth-user profile + preference bootstrap trigger plus defensive callback bootstrap.
- [x] Four-step resumable onboarding wizard.
- [x] Database-backed attempt selector with a clearly non-academic placeholder until verified Phase 3 attempt data exists.
- [x] Private profile/settings page and avatar upload contract.
- [x] Private avatar storage bucket with own-folder RLS.
- [x] `optionalUser`, `requireUser`, safe return-path and post-auth destination helpers.
- [x] Restricted-feature login prompt preserves the intended destination.
- [x] Desktop/mobile Phase 1 design system preserved and extended.

## V2 database state
- [x] `phase2_auth_profiles` applied to the isolated V2 Supabase project.
- [x] `phase2_auth_function_permissions` applied.
- [x] `phase2_social_login_only` applied to retire obsolete phone OTP rate-limit storage.
- [x] Profile/user-preference own-row policies remain intact.
- [x] Private `avatars` bucket has authenticated own-folder select/insert/update/delete policies.
- [x] `handle_new_auth_user()` RPC execute permissions remain revoked from public/anon/authenticated roles.

## CI verification
Provider-revision PR run: `33280332033`.

- [x] dependency install
- [x] TypeScript
- [x] ESLint
- [x] complete Phase 0 + 1 + 2 test suite
- [x] Next.js production build
- [x] OpenNext / Cloudflare dry-run

## External/manual dependencies
- [x] Google OAuth client credentials entered into the V2 Supabase Google provider and tested end-to-end on staging.
- [x] LinkedIn Developer app has **Sign In with LinkedIn using OpenID Connect** enabled.
- [x] LinkedIn Client ID/Secret entered into the V2 Supabase **LinkedIn (OIDC)** provider and tested end-to-end on staging.
- [x] V2 Auth Site URL and callback redirect allow-list confirmed by successful provider E2E.

`AUTH_RATE_LIMIT_SALT` is no longer required. `SUPABASE_SERVICE_ROLE_KEY` is not required for social authentication; it remains optional for server-only features such as database health logging.

See `docs/AUTH_SETUP.md` for exact setup.

## Acceptance gate
- [x] Google sign-in works end-to-end.
- [x] LinkedIn (OIDC) sign-in works end-to-end.
- [x] Guest uses public/basic surfaces without persistent private data.
- [x] First login is routed into onboarding until `onboarding_completed_at` is set, then skips it.
- [x] Server identifies authenticated identity without client hydration using request-scoped `auth.getClaims()`.

**Final Phase 2 acceptance result: 5/5 verified. Phase 2 is closed. Phase 3 may begin only when explicitly requested.**
