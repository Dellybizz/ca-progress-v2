# CA Progress V2 — Phase 2 Auth Setup

Phase 2 uses the isolated V2 Supabase project and Cloudflare Worker only. Never copy these settings into the legacy CA Progress project.

## Existing public application values

Keep the existing V2 `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No Google credential is exposed to the application because Google OAuth is initiated through Supabase Auth.

## Server-only Cloudflare secrets

Phase 2 phone abuse protection requires both values below at Worker runtime:

- `SUPABASE_SERVICE_ROLE_KEY` — V2 service-role/secret key only.
- `AUTH_RATE_LIMIT_SALT` — a unique cryptographically random value of at least 32 characters.

Neither value may be prefixed with `NEXT_PUBLIC_`, committed to GitHub, pasted into client JavaScript or shared in screenshots. The salt is combined with phone/IP identifiers before SHA-256 hashing; raw phone/IP values are not written to the rate-limit table.

## Supabase Auth URL configuration

In the **CA Progress V2** Supabase project:

1. Authentication → URL Configuration.
2. Set the staging Site URL to `https://ca-progress-v2.habeebaasif622.workers.dev`.
3. Add `https://ca-progress-v2.habeebaasif622.workers.dev/auth/callback` to Redirect URLs.
4. For local testing, also add the exact localhost origin you use plus `/auth/callback`.

Do not add the current production CA Progress hostname during Phase 2.

## Google provider

Google credentials are external account secrets and must be created by the project owner.

1. In Google Auth Platform, create an OAuth 2.0 **Web application** client.
2. Add the staging Worker origin as an Authorized JavaScript origin.
3. In Supabase V2 → Authentication → Providers → Google, copy the provider callback URL shown by Supabase. Add that exact URL as an Authorized redirect URI in Google Cloud. For this V2 project it will normally be under the V2 Supabase project domain, not the Cloudflare Worker callback.
4. Paste the Google Client ID and Client Secret into the **V2** Supabase Google provider and enable it.
5. Keep scopes limited to the normal identity scopes (`openid`, email, profile) unless a later product requirement explicitly needs more.

The application then redirects to `/auth/google`, Supabase performs PKCE OAuth, and `/auth/callback` exchanges the returned code into cookie-backed SSR session state.

## Phone OTP provider and abuse protection

1. Supabase V2 → Authentication → Providers → Phone: enable phone authentication.
2. Configure an SMS provider supported by the Supabase project and enter that provider's credentials in the Supabase dashboard.
3. Review Supabase Auth's built-in OTP expiry/rate limits.
4. Keep the application-level rate protection enabled. Phase 2 additionally permits only 3 OTP sends per phone/10 minutes and 8 per IP/10 minutes, plus bounded verification attempts.
5. CAPTCHA/bot protection is recommended before public production launch; Phase 2's server-side rate table remains required even when CAPTCHA is added.

If `SUPABASE_SERVICE_ROLE_KEY` or `AUTH_RATE_LIMIT_SALT` is missing, phone OTP deliberately fails closed instead of sending unprotected SMS requests.

## Remember this device

- Checked: Supabase's normal long-lived refresh session cookie behavior is retained.
- Unchecked: after successful OAuth/OTP, V2 rewrites the auth token cookies without expiry/max-age so they become browser-session cookies.
- Logout always calls Supabase sign-out server-side and clears the session.

## Guest mode

Guest mode creates only `ca-progress:v2:guest` in browser local storage with a random local ID and timestamp. It does not call Supabase, create an `auth.users` account, or write `profiles`, `user_preferences`, storage objects or other private data.

## CDN/session safety

`proxy.ts` creates a request-specific Supabase SSR client, validates/refreshes identity with `auth.getClaims()`, propagates Supabase cookie/cache headers, and adds `Cache-Control: private, no-store`. Authenticated responses must never be cached and shared across users by Cloudflare.

## Required E2E checks after provider credentials are configured

- Google → callback → first-run onboarding → restored destination.
- Returning Google user skips completed onboarding.
- Phone OTP send, wrong code, correct code, resend/rate-limit behavior.
- Remember-device checked vs unchecked browser behavior.
- Guest can enter basic surfaces but cannot persist private profile data.
- `/settings/profile` prompts a guest to sign in and restores `/settings/profile` after authentication/onboarding.
- Logout removes server-readable identity.
