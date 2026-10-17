# Phase 14 status — bundled native application foundation

Status: Complete

Phase 14 replaces the production-hosted Capacitor WebView with a React interface compiled into `native-shell`. Android and iOS release synchronization now rebuilds and copies that bundle before Capacitor packages it. The production origin is no longer a Capacitor `server.url`; live reload exists only when a developer explicitly sets `CAPACITOR_LIVE_RELOAD_URL`.

## Delivered

- installed splash-to-shell path with no initial production request;
- local Today, Progress, Planner, Focus, Community and Settings frames;
- deterministic local, empty, stale and offline states;
- phone bottom navigation and tablet/desktop-style side navigation;
- safe-area, landscape, dynamic viewport and reduced-motion handling;
- device-local account selection placeholder with no credentials;
- application resume, Android back and allowlisted deep-link handling;
- HTTPS-only external navigation guard;
- build/channel/API compatibility metadata;
- automated source, bundle, configuration and workflow checks.

The frames intentionally use a placeholder local repository. Phase 15 owns native authentication and Phase 16 owns SQLite; neither has started. Website and admin runtime behavior are unchanged.

## Certification

Run `npm run test:mobile:phase14`, followed by repository CI and an Android debug build. The APK must contain `public/assets/app.js` and `public/assets/app.css`, and airplane-mode launch must not require the production website.
