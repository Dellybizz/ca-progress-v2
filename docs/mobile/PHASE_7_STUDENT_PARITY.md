# Mobile Phase 7 — Core Student Feature Parity

Baseline: Mobile Phase 6, rooted in production commit `471ade75da025df51fcf98ba6740f400e10b9cae`.

## Implemented

- Added a single 14-feature mobile parity registry exposed through the v1 capability contract. Every entry declares layout, offline policy, permission boundary, synchronization, failure behavior and analytics policy.
- Added a responsive Feature Tour with local guest progress, authenticated cross-device D1 progress, restart support, loading/error routes and direct links into each feature.
- Replaced the static notification placeholder with the authenticated planner notification center, including loading, empty, error, read and signed-out states.
- Expanded global search from navigation-only shortcuts to subjects, chapters and topics through the versioned academic API. Navigation remains usable if academic search fails.
- Added Feature Tour access to account navigation.

## Certification matrix

| Feature family | Mobile surface | Offline policy | Sync / permission | Status |
|---|---|---|---|---|
| Dashboard/countdown | Priority stream | Saved snapshot | Server model; guest preview | Certified |
| Today | Touch agenda | Online | v1 planner; guest preview | Certified |
| Progress/syllabus | Compact drill-down | Full | Ordered edits; guest preview | Certified |
| Chapter Hub | Chapter workspace | Saved snapshot | Shared services; account | Certified |
| Focus/session review | Timer workspace | Full | Ordered actions; guest preview | Certified |
| Planner/goals/revision/tests | Cards and compact forms | Partial: planner task queue | v1 mutations; account | Certified with declared boundary |
| Notes/exports | Editor and library | Full for private notes | Sanitized edits; account | Certified |
| Activity | Timeline | Online | Server derived; account | Certified |
| Global search | Full-screen command dialog | Online academic lookup | v1 search; guest shortcuts | Certified |
| Attempts/settings | Stacked sections | Online | Profile/device preferences; account | Certified |
| Profile/XP/leaderboards | Responsive private profile/rankings | Online | Server owned and opt-in; account | Certified |
| Study Buddy | Relationship cards | Online | Owner authorized; account | Certified |
| Notifications | App-bar drawer | Online | v1 notification center; account | Certified |
| Feature Tour | Step-by-step walkthrough | Saved locally | Cross-device when signed in | Certified |

“Online” is an explicit supported failure boundary, not an offline claim. Phase 6 remains the authority for the four safe queued mutation families. No last-write-wins behavior was introduced.

## Data and rollout

- Migration `0060_mobile_phase7_feature_tour.sql` adds bounded tour progress and completion time to profiles.
- Migration 0060 must run before deploying code that reads the new columns.
- The `/api/v1` fallback exposes Feature Tour and notification routes without duplicating business logic.
- Production deployment remains excluded until explicitly authorized.

## Deferred by phase boundary

- Resources, PDFs, downloads and uploads: Phase 8.
- Community, realtime presence and push delivery: Phase 9.
- Mobile billing/store policy: Phase 10.
- Capacitor packaging, native permissions, App Store and Play Store submission: Phase 11.
- Release automation and staged rollout: Phase 12.
