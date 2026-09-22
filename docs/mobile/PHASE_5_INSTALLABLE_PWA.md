# Mobile Phase 5 — Installable PWA and Safe Updates

Baseline: Mobile Phase 4 tree based on production commit `471ade75da025df51fcf98ba6740f400e10b9cae`.

## Implemented

- Added a standards-based web app manifest with standalone display, CA Progress identity, install icons, a maskable icon and shortcuts for Today, Focus and Progress.
- Added Apple Home Screen metadata and a dedicated touch icon.
- Centralized service-worker registration at the root application boundary so public, authenticated and offline screens share one update lifecycle.
- Added browser-provided install prompting only after an explicit user action; the application never fabricates or automatically accepts an install prompt.
- Added concise iPhone/iPad Add to Home Screen guidance because iOS does not expose the standard install-prompt event.
- Checks for a new service worker at startup, after connectivity returns, when a tab becomes visible and every 30 minutes while open.
- Keeps a new worker waiting while the current screen is in use. “Update now” activates it and reloads exactly once after the browser confirms controller replacement.
- Preserved the existing data-free offline shell and public build-asset cache. Personalized HTML, RSC, API responses, avatars, signed URLs, authentication and billing data remain outside Cache API.
- Preserved owner-isolated IndexedDB data and the authentication identity lock.

## Update behavior

- Server-rendered content and API-backed data continue to reflect website updates immediately when fetched.
- A deployment that changes browser assets installs a new service worker in the background. An open app offers “Update now”; a closed app receives the current worker on its next launch/update check.
- Phase 5 does not use over-the-air JavaScript to bypass Apple or Google review. Future native-container changes remain subject to the applicable store rules.

## Deferred

- Entity-level offline synchronization and conflict UI: Phase 6.
- Push notifications: later notification phase/native integration.
- Capacitor Android/iOS projects, signed builds and App Store/Play Store submission: Phase 11.
- Production deployment: requires explicit user authorization.
