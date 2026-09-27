# Phase 5 release readiness — 28 September 2026

Status: **not certified for production or store submission**. This report records the current branch and the evidence needed to close Phases 1–5. A debug APK is a test artifact, not proof of device parity.

## Verified in the repository

| Gate | Result |
| --- | --- |
| TypeScript | `npm run typecheck` passes |
| Unit/integration contracts | `npm test` passes 892 tests, including local SQLite attempt and resource flows and deletion conflict handling |
| Source lint | `npm run lint` passes after navigation and test fixes |
| Website compilation | `npm run build` passes |
| Bundled native UI | `npm run native:bundle` passes; installed UI files are local assets |
| Android debug build | Pending GitHub Actions build for the pushed branch; local Android SDK/Gradle are unavailable |
| Signed release and store rollout | Not requested; requires separate release review |

## Route and offline evidence still needed

The repository inventory in `PHASE_0_BASELINE_AND_ROUTE_MATRIX.md` covers 33 student routes. The native shell provides Today, Study, Focus, Plan, Progress, Explore, global search, notifications and account access. Native screen behavior for Dashboard, Today, Focus, Progress, Syllabus, Planner, Calendar, Tests, Notes, Resources, Analytics, Forecast, Community, Activity, Buddy and Profile still requires a paired mobile-site/device capture with both sparse and populated accounts at compact and large phone widths. ICAI updates and ICAI resources use an explicit website handoff. The Chapter Hub remains narrower than the site.

After an authenticated account download, SQLite keeps supported personal edits and downloaded files, and tests queue attempts with stable retry IDs. The complete account history is not downloaded by the bounded bootstrap; offline switching between downloaded attempt contexts is not implemented. Direct website writes are not all present in the mobile journal, and competing edits do not all have field-level merge rules. Large PDF download streaming/range resume and bundled per-level content packs are not implemented. These are release blockers, not just missing screenshots.

## Device certification matrix

| Scenario | Android | iOS |
| --- | --- | --- |
| Fresh sign-in and account download | Not run | Not run |
| Airplane mode edit, force quit, restart | Not run | Not run |
| Website edit and second-device conflict in both reconnection orders | Not run | Not run |
| Low-end and current phone, compact and large text | Not run | Not run |
| Dark mode, screen reader and safe areas | Not run | Not run |
| Storage pressure, pin/remove/re-download, account switch/logout | Not run | Not run |
| Poor network and captive portal | Not run | Not run |
| APK/AAB installed size, cold/warm launch, transition and edit latency, battery | Not measured | Not measured |

Keep store submission and production deployment gated until this matrix passes with build SHA, devices, screenshots and observed values. The debug APK from the branch workflow can be used for hands-on testing; it does not satisfy the phase definitions of done by itself.
