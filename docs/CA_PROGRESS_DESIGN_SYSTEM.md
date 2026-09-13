# CA Progress Design System

## Status

This document is the canonical design direction for the CA Progress agency-quality UI programme.

Phase 0 was added after the first Phase 1/2 implementation. Its baseline commit `9e991b08c413240e070119c42ec18aeefa8d041b` is retained as a historical comparison point. The reimplemented Phase 1/2 architecture is now canonical: `tokens.css` owns design tokens, `components.css` owns reusable primitives, and `shell.css` owns application chrome. There is no late Phase 2 override stylesheet.

The executable baseline lives in `config/design-visual-baseline.mjs`.

## Product design intent

CA Progress should feel like one deliberate product team designed it over time, not like a collection of individually prompted SaaS screens.

The visual direction combines:

- Amie-level restraint for shell, navigation and general application structure.
- Quizlet-level educational clarity for study, chapters and progress.
- Dub-level density and precision for admin and operational surfaces.
- Cal.com-style scheduling clarity for planner/calendar workflows.
- Reclaim-like soft productivity character only in small, intentional moments.

These are behavioural references, not themes to mix visually. CA Progress keeps one canonical palette, typography system, component library and interaction grammar.

## Non-negotiable rules

1. Use typography, spacing, alignment and separators before adding another card.
2. Cards represent real grouping boundaries. Avoid card-inside-card layouts and card soup.
3. CA purple is an action/selection/brand colour. It is not a decorative fill applied everywhere.
4. Default product radius is 8–12px. Larger radii require a functional reason.
5. Borders carry most hierarchy. Ordinary cards and controls have no floating hover lift.
6. No generic glassmorphism, decorative blobs, ornamental gradients or fake “smart” widgets.
7. Status colours are semantic: success, warning, danger and information only.
8. Character should come from CA-specific workflows, language, useful micro-illustration and meaningful student context.
9. Every page gets one dominant purpose and one obvious primary action or reading hierarchy.
10. Mobile is intentionally composed. Do not simply shrink the desktop layout.
11. Accessibility, reduced motion, loading, empty and error states are part of the design, not follow-up polish.
12. Existing backend contracts and production data are not changed merely to achieve a visual redesign.

## Canonical foundation

`app/styles/tokens.css` owns colour, spacing, type, radius, elevation, responsive and theme tokens. Existing token names remain compatibility contracts until their consumers are deliberately migrated.

`app/styles/components.css` owns reusable buttons, inputs, selects, cards, badges, progress, tabs, skeletons, empty states, overlays, dialogs and toasts. Existing class names are preserved; changing the visual system must not silently break component contracts.

`app/styles/shell.css` owns student/admin application chrome: desktop sidebar, topbar, account controls, navigation groups, mobile bottom navigation and public-shell framing. Phase 2 must be implemented here rather than through a later override file.

New page work should use these foundations rather than introducing a new local mini-design-system.

## Phase 0 visual baseline

The required comparison viewports are:

| Baseline | Viewport | Purpose |
| --- | --- | --- |
| Desktop | 1440 × 1000 | Main desktop product composition and shell density |
| Mobile | 390 × 844 | Primary mobile composition, fixed navigation and touch hierarchy |

The baseline route set is intentionally small and representative:

| Route | Responsibility | Current visual ownership | Main redesign risk |
| --- | --- | --- | --- |
| `/dashboard` | Daily student command centre | `dashboard-a1.css` for the authenticated composition; `dashboard.css` and `student-dashboard.css` for guest/onboarding compatibility | A1.1 removes four stacked override generations and gives the signed-in dashboard one authoritative, mobile-composed stylesheet. |
| `/study` | Focused study-session workspace | `phase6.css`, `surfaces.css`, `study-clarity.css`, `study-layout-refine.css` | Later refinements override older phase-level treatments. |
| `/planner` | Tasks and schedule | `phase6.css`, `surfaces.css`, `planner-clarity.css`, `planner-mobile-final.css`, `planner-desktop-layout-fix.css` | Mobile and desktop patch files sit on top of the main planner layer. |
| `/progress` | Academic progress tracking | `progress.css`, `academic.css`, `surfaces.css` | Academic hierarchy and generic surfaces must remain visually coherent. |
| `/chapters/[chapterId]` | Chapter study workspace | `academic.css`, `chapter-hub.css` | Must feel connected to Study/Progress without becoming another dashboard. |
| `/community` | Peer/community entry | `phase7.css`, `product-phase7-community.css` | Needs conversational composition without adopting a second design system. |
| `/settings` | Account, academic profile, plan and export controls | `surfaces.css`, `phase10.css`, `phase11.css`, `phase11-lock.css` | Still contains preview-era presentation and accumulated phase styling. |
| `/admin` | Operations command centre | `shell.css` plus route-level inline styles | Admin overview has substantial inline styling that must eventually move into canonical utility components. |

All route-specific ownership is also encoded in `config/design-visual-baseline.mjs` so it can be checked automatically.

## Baseline capture contract

For each baseline route, visual QA should compare both desktop and mobile at the fixed sizes above. Use a deterministic account/data fixture where the route depends on user state. Dynamic values such as current countdown numbers, timestamps and live community content should be treated as content variance rather than visual-regression failures.

Each comparison should inspect:

- shell/navigation behaviour;
- page title and primary action hierarchy;
- density and whitespace;
- number and nesting depth of cards;
- use of purple and semantic colours;
- typography and alignment consistency;
- loading/empty/error treatment where relevant;
- mobile touch targets, overflow and bottom-navigation clearance;
- dark-mode legibility when the page supports it.

## Phase 1 implementation contract

Phase 1 changes the visual system without breaking the component API.

- Preserve established CSS variable names used by production pages.
- Preserve established primitive class names used by React components.
- Use a compact 8–12px default radius hierarchy.
- Use borders as the default grouping mechanism and reserve shadows for overlays/popovers.
- Avoid lift transforms on ordinary buttons/cards.
- Use a solid brand progress treatment, semantic status colours and restrained typography weights.
- Ensure dark mode and accent variants remain complete.
- Keep reduced-motion behaviour.

## Phase 2 implementation contract

Phase 2 changes shared navigation and chrome without creating a second styling authority.

- `shell.css` is the only application-shell stylesheet.
- Desktop primary flow stays directly visible: Dashboard, Today Plan, Study, Progress and Planner.
- Secondary destinations are grouped by job: Study tools, Library, Community and Account.
- Existing student destinations must remain reachable, including Analytics and Study Buddy.
- Dashboard subroutes keep Dashboard active.
- Secondary tools such as Forecast, Goals and Tests activate More on mobile rather than pretending to be Progress.
- Mobile uses Home / Today / Study / Progress / More with a flat edge-to-edge bottom rail.
- Production does not display environment/debug chrome; non-production environments may.
- No glass blur, floating bottom-nav pill or decorative shell gradients.

## Page-specific composition guidance

### Dashboard

The dashboard is the reference student screen. It should answer: “What should I do now, how am I doing, and what important CA information changed?” It may contain more information than other pages, but should not become a uniform card grid.

### Study

Study is an action screen. The current session/timer and selected academic context should dominate. Analytics and secondary controls are subordinate.

### Planner

Planner should feel schedule-led rather than dashboard-led. Rows, timelines, calendar structure and task grouping should do more work than cards.

### Progress

Progress should privilege academic hierarchy: overall progress → subjects → chapters/revision state. Visual emphasis should communicate completion and readiness, not decoration.

### Chapter workspace

A chapter page is a focused academic workspace. Chapter identity, status and the next useful action come first; notes/resources are supporting material.

### Community

Community should feel conversational and identity-led. Channel lists, messages and peer context can use denser row/list treatments rather than general-purpose dashboard cards.

### Settings

Settings should become a quiet utility surface organised by account concerns. It should not look like a product demo page or pricing dashboard.

### Admin

Admin should use compact operational patterns: tables, rows, filters, statuses and attention queues. Decorative student-product treatments should be minimized.

## Legacy CSS policy

Do not bulk-delete route-specific legacy CSS.

For each redesigned route:

1. inspect which legacy rules are actually active;
2. migrate the required behaviour into canonical route/component styles;
3. compare desktop and mobile against the historical baseline;
4. remove only the superseded selectors/files for that route;
5. run focused regression tests before moving to the next route.

The dashboard stack is the highest-priority route consolidation target because it currently has the most successive visual generations loaded globally.

## Agency-quality review questions

Before approving a screen, ask:

- Can the primary job of the page be understood in a few seconds?
- Would removing a card improve hierarchy?
- Does every accent colour communicate an action, selection, status or genuine brand moment?
- Are typography and spacing doing enough of the visual work?
- Does the screen look related to the rest of CA Progress without being mechanically identical?
- Is there any visual treatment present only because it looks “modern”?
- Does the mobile layout feel deliberately designed rather than compressed?
- Would a product designer be able to explain why each prominent element exists?

If the answer to the last question is no, simplify the screen.
