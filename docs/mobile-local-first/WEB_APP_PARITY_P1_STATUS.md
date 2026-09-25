# P1 — Shared mobile shell parity status

25 September 2026 · Working branch `mobile-phase7-student-parity`

**Status: implementation in progress; device parity gate open.** Do not mark P1 complete or start P2 based on compilation alone. P0's authenticated matched mobile references are also still open; see `WEB_APP_PARITY_P0.md`.

## Delivered at `1886797c8fbdc42c85b96ee83d7b106dc8929e0b`

- Bottom navigation uses the same four primary destinations plus More in five equal slots. The More sheet lists secondary website destinations by section and shows the saved attempt with a path to academic context.
- Mobile app bar has website-style search, notification and account entry points. Back uses browser history with a Dashboard fallback.
- Search modal includes website navigation/account entries, saved subjects and synchronized chapters. Academic results currently open the matching top-level Syllabus or Progress screen; detail-route parity is a later phase.
- Notification drawer renders account-isolated local records and marks a selected record read locally before best-effort server acknowledgment. Deep links route to the current bundled top-level screen.
- Account menu uses the website account-navigation contract and native secure sign-out.
- Unknown native hashes now render a stable unavailable screen instead of silently showing Dashboard.
- Keyboard shortcut opens search; bottom navigation moves aside when the visible viewport indicates an on-screen keyboard. Tokens and icons remain shared with the website.

## Verification

Mobile workflow `36127533106`: `test:mobile:phase20`, TypeScript, lint, and production build passed in verify job. Android debug and iOS simulator jobs passed. Artifact ID `10860132850`; extracted APK SHA-256 `1db071864c4594e8eb90fb20018ae3a5f3c845a45a36397d5a41f53c495bf515` (4,442,403 bytes). Earlier intermediate commits failed until the route union and effect lint were corrected; use the final SHA only.

## Remaining P1 gate

1. Compare site/app shell at 360–390 px and 414–430 px on Android and iOS, light/dark, same authenticated account and attempt. Capture app bar, bottom nav, More sheet, search, notification drawer, account menu and all states.
2. Verify exact labels, order, spacing, icons, active-state route matching, safe areas, touch targets, keyboard resize, external-link handoff and physical/system back.
3. Test bundle cold start with airplane mode on both platforms. Test local search and notification records after a previous sync.
4. Complete the attempt-switcher behavior when attempt options and mutation contract are available. The current menu displays the saved attempt and opens Profile; it does not yet perform an in-menu attempt change.
5. Resolve P0's authenticated mobile website reference gate and identify any remaining shell UI controls or route omissions.

No website components, server behavior, D1 schema or production records were changed for P1. No merge to `main`.