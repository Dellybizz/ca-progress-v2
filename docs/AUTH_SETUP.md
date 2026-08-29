# CA Progress V2 — Phase 2 Auth Setup

Phase 2 uses the isolated V2 Supabase project and Cloudflare Worker only. Never copy these settings into the legacy CA Progress project.

The active Phase 2 login methods are now **Google**, **LinkedIn (OIDC)**, and **Guest**. Phone OTP has been retired from the product authentication surface.

## Existing public application values

Keep the existing V2 `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Google and LinkedIn client secrets are stored only inside the V2 Supabase Auth provider configuration; they are never exposed to the application.

`SUPABASE_SERVICE_ROLE_KEY` is not required for Google/LinkedIn authentication. Keep it configured only if a server-only feature such as database health logging uses it. `AUTH_RATE_LIMIT_SALT` is no longer required.

## Supabase Auth URL configuration

In the **CA Progress V2** Supabase project:

1. Authentication → URL Configuration.
2. Set the staging Site URL to `https://ca-progress-v2.habeebaasif622.workers.dev`.
3. Add `https://ca-progress-v2.habeebaasif622.workers.dev/auth/callback` to Redirect URLs.
4. For local testing, also add the exact localhost origin you use plus `/auth/callback`.

Do not add the current production CA Progress hostname during Phase 2.

## Google provider

1. In Google Auth Platform, create an OAuth 2.0 **Web application** client.
2. Add `https://ca-progress-v2.habeebaasif622.workers.dev` as an Authorized JavaScript origin.
3. In Supabase V2 → Authentication → Providers → Google, copy the provider callback URL shown by Supabase.
4. Add that exact Supabase callback URL as an Authorized redirect URI in Google Cloud. For this V2 project it is `https://wgdhpzbgyjqjlgntibqg.supabase.co/auth/v1/callback`.
5. Paste the Google Client ID and Client Secret into the **V2** Supabase Google provider and enable it.
6. Keep scopes limited to normal identity scopes (`openid`, email, profile) unless a later requirement explicitly needs more.

The application starts Google OAuth at `/auth/google`. Supabase performs the OAuth flow and returns to `/auth/callback`, where V2 exchanges the PKCE authorization code into cookie-backed SSR session state.

## LinkedIn (OIDC) provider

Use **LinkedIn (OIDC)**, not the retired legacy LinkedIn provider.

1. Open the LinkedIn Developer Dashboard and create a LinkedIn app.
2. LinkedIn requires the app to be associated with a LinkedIn Page and to have an app logo.
3. Open the app's **Products** tab.
4. Request/enable **Sign In with LinkedIn using OpenID Connect**.
5. Open the app's **Auth** tab.
6. Under Authorized Redirect URLs, add the exact Supabase V2 callback URL: `https://wgdhpzbgyjqjlgntibqg.supabase.co/auth/v1/callback`.
7. Confirm the OIDC identity scopes supplied by LinkedIn are available for the app.
8. Copy the LinkedIn Client ID and Client Secret.
9. In Supabase V2 → Authentication → Providers → **LinkedIn (OIDC)**, enable the provider and paste the Client ID and Client Secret.
10. Save the provider configuration.

The application starts LinkedIn OAuth at `/auth/linkedin` using Supabase provider `linkedin_oidc`. It uses the same `/auth/callback` PKCE exchange, onboarding decision, remembered-device behavior, and safe return destination as Google.

## Phone authentication

Phone OTP is intentionally not part of the current CA Progress V2 login design. Keep the Supabase Phone provider disabled unless a future approved phase explicitly brings it back.

The old Phase 2 OTP rate-limit table is removed by `20260830020300_phase2_social_login_only.sql`, and the phone request/verify application routes are removed from the current codebase.

## Remember this device

- Checked: Supabase's normal long-lived refresh-session cookie behavior is retained.
- Unchecked: after successful Google or LinkedIn OAuth, V2 rewrites the auth token cookies without expiry/max-age so they become browser-session cookies.
- Logout always calls Supabase sign-out server-side and clears the session.

## Guest mode

Guest mode creates only `ca-progress:v2:guest` in browser local storage with a random local ID and timestamp. It does not call Supabase, create an `auth.users` account, or write `profiles`, `user_preferences`, storage objects, or other private data.

## CDN/session safety

`proxy.ts` creates a request-specific Supabase SSR client, validates/refreshes identity with `auth.getClaims()`, propagates Supabase cookie/cache headers, and adds `Cache-Control: private, no-store`. Authenticated responses must never be cached and shared across users by Cloudflare.

## Required E2E checks after provider credentials are configured

- Google → callback → first-run onboarding → restored destination.
- Returning Google user skips completed onboarding.
- LinkedIn → callback → first-run onboarding → restored destination.
- Returning LinkedIn user skips completed onboarding.
- Remember-device checked vs unchecked browser behavior for both OAuth providers.
- Guest can enter basic surfaces but cannot persist private profile data.
- `/settings/profile` prompts a guest to sign in and restores `/settings/profile` after authentication/onboarding.
- Logout removes server-readable identity.
