# Mobile Phase 11 — Native packaging and submission readiness

Phase 11 adds Capacitor 8 Android and iOS projects around the shared production application. The bundle/application identifier is `in.zanisheluxe.caprogress` and native requests identify themselves with `CAProgressNative/<platform>/1`, activating the Phase 10 store-billing guard.

## Implemented

- Version-pinned Capacitor core, CLI, Android, iOS, App, Keyboard, Splash Screen and Status Bar packages.
- Reproducible platform-specific add/sync/open scripts. `CAPACITOR_PLATFORM` generates the correct iOS or Android native user-agent marker.
- HTTPS-only production origin with mixed content and Android WebView debugging disabled.
- Universal/App Link manifests, native intent/entitlement configuration and allowlisted in-app navigation. Unknown origins and paths are ignored.
- Android hardware-back behavior, resume refresh and deep-link routing through Capacitor's App API.
- No sensitive device permissions. The first build requests only Android Internet access.
- Public, fail-closed association endpoints. They return 503 until the real Apple Team ID and Play signing fingerprint are configured rather than publishing fake trust statements.
- Public and in-app account-deletion initiation with a seven-day cancellation window, D1 migration `0062`, privacy-policy disclosure and later processor boundary.
- Separate Apple and Google submission records with explicit blockers.

## Update behavior

Ordinary hosted UI, API and study-feature updates deploy once to Cloudflare and are then used by the website and native shells. Any change to native plugins, permissions, billing, identifiers, signing, privacy declarations or native code requires a new reviewed store release. This boundary must not be weakened to bypass store review.

## Required external completion

The repository cannot create developer accounts, accept store agreements, invent Team IDs/signing fingerprints, create approved subscription products, supply reviewer credentials, sign release artifacts, or submit listings. Android can be compiled in a compatible JDK/SDK environment; iOS archive/signing requires macOS and Xcode.

Phase 12 owns signed release automation, complete deletion processing, device matrices, store screenshots/assets, TestFlight/Play testing tracks and staged rollout. Run `npm run test:mobile:phase11` and full CI before hand-off.
