# Phase R1 — Mobile content-priority matrix

Outcome parity is mandatory; component parity is not. `Remove on mobile` means removing duplicate presentation, never removing the underlying capability.

| Route group | Mobile purpose / primary action | Keep | Condense or merge | Move or defer | Remove on mobile |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Start the next useful study action | next action, syllabus progress, exam status, urgent ICAI item | streak + study total; countdown metadata | leaderboard and older updates to their routes | duplicate shortcuts and decorative charts |
| Today Plan | Execute the next scheduled item | anchored timeline, next task, complete/reschedule | day summary | explanations and future days | duplicate planner navigation cards |
| Planner | Capture or organize work | quick add, today’s tasks | analytics into one summary | calendar and plan details to dedicated routes | desktop multi-column panels |
| Study | Start/pause/finish a session | timer, selected context, primary controls | session metadata | history/analytics after completion | unrelated dashboard metrics |
| Progress | Find the next syllabus gap | overall state, subject list, chapter status | summary metrics | evidence/history into subject/chapter detail | decorative completion cards |
| Analytics/Forecast | Understand one trend or risk | selected period, key finding, accessible chart | secondary metrics | full breakdown into disclosure/detail | non-actionable charts |
| Tests | Add or inspect an attempt | applicable chapter, add attempt, recent attempts | score/status metadata | full attempt history into detail | test-provider language/actions |
| Notes | Find or edit one note | search/list or editor, save state | metadata | folders/tools into sheets; list hidden while editing | desktop split-pane chrome |
| Resources/Updates | Find and open trusted content | provenance, title, academic scope, open action | metadata and badges | filters to sheet; full evidence to detail | wide table and duplicate category cards |
| Community | Select a channel or converse | active list or conversation, composer | message metadata | channel/details/actions to separate surfaces | simultaneous sidebar + chat on phone |
| Study Buddy/Activity | Take one accountability action | current relationship/action or activity summary | achievements/rank | full rankings/history | promotional gamification blocks |
| Settings/Billing | Manage one account concern | section list, current value, save/confirm | account summary | complex edits to focused pages | preview/demo panels |
| Admin lists | Resolve the highest-priority item | status, key identity, filter, safe action | metrics and row data | filters/detail/action confirmation to sheets/pages | hidden columns and dense desktop toolbars |
| Login/Onboarding | Authenticate or finish the current setup step | one decision, progress, continue | supporting explanation | optional help | feature tour and duplicate benefits |

## Device and interaction acceptance

- Validate at 360×800, 390×844 and 430×932, plus portrait/landscape and virtual-keyboard states.
- No application-level horizontal overflow; only timelines or filter chips may intentionally scroll horizontally.
- Interactive targets are at least 44×44 CSS pixels and remain usable at 200% text zoom.
- Bottom navigation and sticky actions respect safe-area insets and do not cover focused inputs.
- List → detail transitions preserve filters, scroll position and unfinished input.
- Slow, offline/reconnect, loading, empty, stale, permission and error states retain the next safe action.

## Route-level approval

The executable config/refinement-r1-route-decisions.mjs expands this matrix over every route in the certified R0 contract. Each of the 46 routes has a page purpose, reference owner, primary mobile action, ordered information hierarchy, explicit transformations and outcome-parity requirement. The closure test fails when a contracted route is added without an R1 decision.
