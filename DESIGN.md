# CA Progress design constitution

Status: approved Phase R1 contract. This file governs later refinement phases; existing production contracts remain unchanged until their owning route is deliberately migrated.

## Product language

CA Progress is an educational operating workspace: calm enough for daily use, precise enough for academic decisions, and dense only where density improves action. The visual thesis is **educational clarity inside a restrained, precise study workspace**.

- Neutral grey/black/white surfaces form the foundation.
- CA purple identifies brand, selection and primary action; it is not decoration.
- Semantic success, warning, danger and information colours describe real states only.
- Typography, spacing, separators and alignment establish hierarchy before containers.
- Default product radii stay within 8–12px; shadows belong mainly to overlays.
- Body copy is readable, concise and specific to CA study work.

The implementation source of truth remains `app/styles/tokens.css`, `app/styles/components.css` and `app/styles/shell.css`. Preserve their public variables and component contracts until Phase R2 migrates them deliberately.

## Page constitution

1. Every page has one primary purpose and one obvious action or reading hierarchy.
2. Dashboard is the only broad daily summary. Other routes do not become mini-dashboards.
3. Study, Progress, Analytics, Planner, Tests, Notes and Resources remain separate jobs.
4. Cards represent genuine grouping boundaries. Nested cards and uniform card grids are rejected.
5. Secondary explanation, analytics and metadata use progressive disclosure.
6. Loading, empty, error, stale, offline and permission states preserve context and offer the next safe action.

## Interaction constitution

- Navigation is stable and server authorization remains authoritative.
- Filters are URL-aware where share/back/forward behaviour matters and preserve selection across list/detail navigation.
- Menus, popovers and dialogs close on Escape, outside click, selection and route change where appropriate, then restore focus.
- Mobile complex actions use bottom sheets or full-screen task flows; desktop dialogs are never merely shrunk.
- Destructive and privileged actions state consequence, require the existing authorization/confirmation contract and return durable evidence where supported.
- Optimistic presentation is limited to safely reversible or idempotent operations.

## Mobile transformation constitution

Before editing an affected route, classify every desktop element as `keep`, `condense`, `move`, `defer`, `merge` or `remove on mobile`. Preserve outcome parity without preserving desktop composition.

- Canonical student mobile navigation is Home / Today / Study / Progress / More.
- Reorder content by urgency and frequency, not desktop column order.
- Convert wide tables into labelled summaries with complete detail access.
- Use one primary mobile workspace at a time: list, detail, conversation or editor.
- Preserve filter state, scroll position and unfinished input across transitions.
- Maintain 44px targets, visible focus, keyboard access, safe areas, zoom, dynamic text and reduced motion.
- Prohibit application-level horizontal scrolling.

## Reference ownership

- Quizlet: learning hierarchy and state language.
- Amie: calm workspace and calendar hierarchy.
- Todoist: today-first planning and task completion.
- Goodnotes: focused note canvas and touch tool discipline.
- Dub: analytics hierarchy and compact filters.
- Linear: admin lists, tables, search and keyboard rigor.

These are evidence sources, not themes. See `docs/refinement-r1/REFERO_EVIDENCE.md` and `docs/refinement-r1/ROUTE_REFERENCE_MAP.md` for bounded adoption and rejection decisions.

## Measurable acceptance targets

- 360px is the compact-phone floor; primary validation also covers 390px, 430px and 1440px.
- No unintended horizontal application overflow.
- Main body text defaults to at least 15px; routinely used controls/labels remain readable.
- All primary interactions are keyboard reachable and visibly focused.
- Reduced-motion preference disables nonessential motion.
- Each redesigned route passes focused functional, authorization, accessibility, touch, viewport and adaptive-layout checks before deployment.

## Explicit anti-patterns

Do not ship oversized authenticated-page headings, decorative gradients, glassmorphism, floating card grids, duplicated navigation, hidden table data, tiny touch controls, colour-only status, desktop modal compression, arbitrary route-level tokens, or a literal clone of any reference product.

