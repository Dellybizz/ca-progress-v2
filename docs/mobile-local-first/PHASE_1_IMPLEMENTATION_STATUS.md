# Phase 1 implementation status — 27 September 2026

Branch: `mobile-phase7-student-parity`. This change is local; no production site or GitHub push is included.

## Implemented

- Native study navigation now has Today, Study, Focus, Plan and Progress tabs. The header Explore control opens the full site navigation directory with search, the attempt selector, and account entry points. Dashboard remains its own route inside Explore.
- Nested destinations retain the parent tab selection. Goals and Revision settings open the existing local Planner controls. Search opens the selected downloaded subject or chapter rather than only the generic catalogue.
- Supported canonical web links for syllabus, notes, goals, activity, buddy and planner revision settings resolve to native destinations. Unsupported Explore destinations display an explicit website handoff and require connectivity.
- Compact phone layout gives the tab bar system inset clearance and reduces Progress metrics and Focus control spacing. No academic values are fabricated.

## Verification

- TypeScript typecheck, native bundle generation and 25 focused mobile foundation/local-data tests pass.
- The previous full suite passed 885 tests on this branch before the final navigation refinements; a fresh full-suite/device run is still needed to certify release behavior.

## Open parity work

- Live mobile-site-to-installed-app screenshots at compact and large phone widths were not captured here; visual parity and accessibility remain unverified.
- ICAI updates and ICAI resources still open the website. Exact nested site chapter URLs do not yet restore every subject/chapter context; the native chapter controls lack the full site Chapter Hub, including notes and resources on that screen.
- Initial academic download, complete offline test entry, multi-attempt edits, and web/native conflict reconciliation belong to later local-data and sync phases. This shell change does not certify them.
- Build and manually inspect an Android installation before calling Phase 1 complete. Compare Dashboard, Today, Focus, Progress, Syllabus, Chapter Hub, Planner, Tests, Notes, Resources, Analytics, Explore and Profile against the mobile site at two widths and with sparse/populated data.
