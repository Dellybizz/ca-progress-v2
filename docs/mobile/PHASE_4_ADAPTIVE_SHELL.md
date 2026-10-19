# Mobile Phase 4 — Shared Design System and Adaptive App Shell

Baseline: Mobile Phase 3 tree based on production commit `471ade75da025df51fcf98ba6740f400e10b9cae`.

## Implemented

- Kept the neutral CA Progress tokens, semantic status colours and existing desktop sidebar as the single visual system.
- Replaced the mobile brand-only header with a route-aware app bar and safe back action for nested screens.
- Retained the canonical `Home / Today / Focus / Progress / More` mobile navigation and complete destination sheet.
- Transforms the bottom navigation into a compact navigation rail on tablet-width screens instead of stretching a phone bar.
- Added safe-area handling for notches, rounded corners, home indicators and standalone display mode.
- Added `visualViewport` keyboard detection so fixed navigation leaves the keyboard and focused controls unobstructed.
- Added compact landscape rules for short mobile viewports.
- Added live offline/restored status without blocking local work.
- Strengthened modal, drawer and bottom-sheet focus management, body scroll locking, Escape handling and browser/native back-event closure.
- Preserved shared light/dark mode, reduced motion, 44px touch targets and all student/admin destinations.
- Retained route-level loading and error boundaries and the existing owner-isolated offline state surfaces.

## Responsive contract

- `<720px`: touch-first app bar and five-item bottom navigation.
- `720–899px`: compact left navigation rail with normal content height and tablet-safe sheets.
- `>=900px`: existing desktop sidebar and topbar.
- Short landscape phone viewports reduce chrome height without hiding features.
- When the software keyboard is open, bottom navigation moves out of the input workspace and returns when the viewport recovers.

## Deferred

- Installability and service-worker update activation: Phase 5.
- Entity-level offline synchronization and conflict UI: Phase 6.
- Native status bar, haptics and plugin-specific behaviour: Phase 11.
- Production deployment: requires explicit user authorization.
