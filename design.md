# CA Progress Product Design Rules

## Purpose

This file is the working design contract for every current and future CA Progress page.
It translates the product decisions made during the agency-quality redesign into rules
that designers, developers and AI agents can apply consistently.

CA Progress is a focused academic productivity product for CA students. It should feel
calm, precise and intentionally designed—not like a collection of generated dashboard
templates. Every screen must help the student understand their current academic state
and take the next useful action quickly.

## Design thesis

**A restrained academic workspace with clear hierarchy, compact density and fast,
dependable interactions.**

The product combines:

- Quizlet-like clarity for subjects, chapters, tests and progress.
- Amie-like restraint for the shell and general workspace hierarchy.
- Todoist-like speed for Today and Planner actions.
- Goodnotes-like focus for notes and study workspaces.
- Dub/Linear-like precision for analytics and administration.

These are interaction references, not visual themes to copy. Refero is used to research
specific interface problems page by page. CA Progress always keeps its own shared visual
language.

## Core product rules

1. **One page, one primary purpose.** The dominant task must be clear within a few
   seconds.
2. **Show the product, not an introduction to it.** Authenticated pages open on useful
   state and actions, not marketing-sized headings or explanatory filler.
3. **Use hierarchy before containers.** Prefer typography, spacing, alignment, dividers,
   rows and lists before adding another card.
4. **Cards represent real grouping.** Avoid card soup, nested cards and a grid in which
   every item has equal visual weight.
5. **One obvious primary action.** Secondary actions must be quieter or progressively
   disclosed.
6. **Real data only.** Do not add fake metrics, placeholder activity, decorative charts
   or functionality that has no working data path.
7. **Preserve context.** Navigation, filters, scroll position, unfinished input and
   academic selection should survive reasonable transitions.
8. **Fast feedback is part of the design.** Completion, saving and selection must update
   optimistically. Network persistence continues without blocking the interface and
   failures offer a clear retry or rollback.
9. **Outcome parity, not component parity.** Mobile must support the same outcome as
   desktop without copying every desktop panel.
10. **Accessibility and system states are first-class.** Keyboard use, focus, reduced
    motion, loading, empty, stale, offline, permission, error and success states must be
    intentionally designed.

## Visual language

### Colour

- Use a neutral grey, black and white foundation.
- CA Progress purple is reserved for the primary action, active selection, focus state,
  progress and occasional brand emphasis.
- Do not flood large surfaces with purple.
- Green, amber, red and blue communicate success, warning, danger and information only.
- Do not use decorative gradients, glassmorphism, glowing blobs or arbitrary pastel
  panels.
- Light and dark themes must use semantic tokens rather than hard-coded page colours.

Canonical colour tokens live in `app/styles/tokens.css`.

### Typography

- Use Inter/system sans through `--font-sans`.
- Prefer strong, compact headings with clear weight contrast over oversized type.
- Authenticated page titles use the product scale, not landing-page hero sizes.
- Body and control text must remain comfortably readable; metadata is quieter but not
  illegibly small.
- Avoid all-caps labels except short structural navigation labels or genuine data codes.
- Remove repeated headings and descriptions when the interface already explains itself.

### Spacing and density

- Use the 4px spacing rhythm defined by `--space-*` tokens.
- Student surfaces are compact but scannable; administrative surfaces may be denser.
- Desktop product content is visually scaled to **90%** where the migrated route calls
  for the compact layout. Width compensation must preserve the original usable canvas;
  scaling must not create artificial side padding or a narrow centred page.
- Mobile outer gutters are compact. Progress chapter cards use a small **6px inner side
  padding** so the first and last controls do not touch or clip against the card edge.
- Large empty areas must have a functional purpose. Do not use whitespace to imitate a
  portfolio mockup.

### Shape, borders and elevation

- Default radii are 8–12px; 16–20px is reserved for larger dialogs or intentionally soft
  feature surfaces.
- Hairline borders provide most grouping and hierarchy.
- Ordinary cards and controls do not float or lift on hover.
- Shadows are mainly for overlays, menus, popovers and modal separation.
- Use flat lists, rows and dividers for repeated information.

### Icons and imagery

- Icons clarify actions or categories; they are not decoration.
- Use one consistent rounded outline icon family and stable icon sizes.
- Avoid decorative icon circles on every row.
- Small CA/student character moments may appear sparingly where they add warmth, such as
  the dashboard, but never compete with study tasks or data.

## Canonical application shell

### Desktop navigation

The main work destinations remain directly visible:

- Dashboard
- Today
- Study
- Progress
- Planner

Secondary destinations are grouped under expandable sections:

- Plan & Review
- Knowledge
- People
- Account

The current group opens automatically. The primary destination within the open group is
clear, while the remaining links sit underneath it. This hierarchy must not be replaced
with one long flat sidebar.

The desktop shell includes the attempt/workspace switcher, global search and a compact
account control. Menus close on outside click and Escape. Search results and navigation
must use real destinations.

### Mobile navigation

The canonical mobile rail is:

- Home
- Today
- Study
- Progress
- More

More provides secondary destinations in a sheet or focused list. Do not reproduce the
desktop sidebar as a long hamburger menu.

### Breadcrumbs and route history

Breadcrumbs represent the route the student actually followed, not a hard-coded generic
parent. For example, opening an ICAI update from Dashboard must preserve Dashboard in the
trail rather than inventing Revision Settings. The shared route-trail implementation is
required on every current and future navigable page.

Rules:

- The current page is the last, non-linked item.
- Previous items are valid links to the visited context.
- Direct URL entry uses the safest canonical parent.
- Refresh preserves the current trail without duplicating entries.
- Invalid, stale or unauthorized trail entries are discarded.
- Page-local breadcrumbs must not compete with the shared route trail.

## Shared component contract

New pages use the primitives in `app/styles/components.css` and semantic tokens in
`app/styles/tokens.css`. Do not create a new route-local button, card, tab, status or form
system when a canonical primitive exists.

### Buttons and actions

- Primary: solid brand colour, one per active decision area.
- Secondary: neutral surface with border.
- Ghost: low-emphasis contextual action.
- Danger: destructive actions only and normally behind confirmation.
- Minimum touch target: 44×44 CSS pixels.
- Labels describe the result: “Start Focus”, “Update progress”, “Save note”. Avoid vague
  labels such as “Continue” when the outcome is not obvious.

### Forms and selectors

- Selectors apply immediately when safe and must not trigger a full-page loading state.
- Academic selectors preserve Level → Group → Subject → Chapter dependency.
- Use “Both groups”, not “All groups”, where both CA groups are the actual scope.
- Subject labels use the agreed compact names: Law, Costing, Audit and FM SM.
- Taxation subheadings are Income Tax (DT) and Goods and Services Tax (IDT).
- FM SM subheadings are Financial Management and Strategic Management.
- Validation is inline, specific and keeps the user’s input.

### Tabs, sheets and dialogs

- Tabs switch peer views within the same task; they do not imitate site navigation.
- Mobile filters and secondary tools move into bottom sheets or focused full-screen flows.
- Destructive or important decisions use dialogs with a clear cancel path.
- Temporary reflections and confirmations are dialogs, not permanent page sections.
- Overlays close predictably and restore focus to their trigger.

### Data and status

- Never hide essential desktop table columns on mobile. Transform them into labelled
  summary cards/rows and expose full detail in a sheet or page.
- Use progress bars only when there is a meaningful finite total.
- Show skeletons only for content that is genuinely pending; preserve already-known
  content while refreshing.
- Empty states explain the next useful action without motivational filler.

## Responsive design contract

Mobile is designed as a separate composition at 360px, 390px and 430px widths. It is not
a desktop layout scaled down.

For every page, classify desktop content as:

- **Keep:** essential to the mobile task.
- **Condense:** preserve the outcome in a smaller summary.
- **Merge:** combine repeated information or actions.
- **Move:** place in a sheet, tab, detail page or More.
- **Defer:** show after the primary action or deeper in the flow.
- **Remove on mobile:** remove only duplicate presentation, never the capability.

Mobile requirements:

- No page-level horizontal overflow.
- No clipped first or last controls.
- Bottom navigation and sticky actions respect safe areas.
- Focused inputs remain visible above the keyboard.
- Touch targets remain at least 44px.
- Information is ordered by urgency and action, not desktop column order.
- Large desktop side rails become tabs, sheets or drill-down views.
- List-to-detail transitions preserve filters, position and unfinished input.

## Motion and perceived performance

- Motion explains state change; it must not decorate routine navigation.
- Use the shared 140–180ms transitions for normal controls.
- Do not animate layout properties when transform or opacity can express the change.
- Respect both system reduced-motion preference and the in-product setting.
- The interface responds before slow persistence finishes whenever rollback is safe.
- Starting, pausing, completing or dismissing Focus must not reconstruct the page or show
  a blank intermediate layout.
- Previously loaded summaries remain visible while fresh data arrives.
- Avoid spinners for mutations that can be represented by an immediate selected/saved
  state and a quiet background sync indicator.

## Feature and page rules

### Dashboard — “What should I do now?”

The dashboard is the daily student command centre, not a miniature copy of every page.

- Main column: current context, Today/next action, active study state, syllabus completed
  and compact quick actions.
- Compact side rail: exam countdown, leaderboard and important ICAI updates.
- ICAI updates link to their real detail/context and preserve the Dashboard breadcrumb.
- No fake metrics, duplicated primary actions, decorative charts or full Progress-page
  duplication.
- Mobile keeps the next action, syllabus progress, exam status and urgent update; older
  updates and leaderboard detail move deeper.

### Study / Focus — “Start or continue focused study”

The feature is named **Focus** across navigation, actions and user-facing copy.

- Focus may start without selecting a subject or chapter.
- Pomodoro uses one persistent circular timer surface. Clicking Start begins the live,
  smooth ring in place; it must not navigate to or rebuild another screen.
- The time remains inside the circle and the layout does not jump between idle, running,
  paused and completed states.
- Stopwatch keeps the same placement and controls but removes the finite progress circle;
  it must not realign the surrounding layout.
- Start, pause, finish and dismiss respond instantly, with persistence handled in the
  background.
- A session review appears once, immediately after a qualifying completed session. It is
  a compact, skippable popup, not a permanent section.
- The review must not reopen on refresh. “Don’t show this again” persists as a preference
  and can be enabled again in Settings.
- Self-reported understanding accepts only 0–100.
- The current minimum duration for showing the completion review is 2 minutes.

### Progress — “What is complete and what comes next?”

- Hierarchy is Level → Group → Subject → Chapter → Done / Rev. 1 / Rev. 2 / Test 1 /
  Test 2.
- The level selector and subject/group selectors are compact, clear scope controls.
- Subject sections require visible headings and agreed short names.
- Chapter rows/cards include a clear “Go to Chapter Hub” action.
- Completion controls update and can be unticked immediately; saving must never freeze
  the page.
- Desktop uses compact rows aligned across chapters.
- Mobile keeps the chapter identity and all five outcomes but composes them as a compact
  card with safe side padding rather than squeezing the desktop row.

### Chapter Hub — “What can I do for this chapter now?”

- Chapter identity, current status and the next useful action come first.
- Primary action: Start Focus.
- Secondary action: Update progress.
- Desktop may use a main workspace with a supporting rail.
- Mobile uses shallow Overview / Study / Resources views. It must not stack every desktop
  section into one long page.
- Overview contains status, concise tests and topics; Study contains the study action;
  Resources contains notes, files, doubts and official sources.
- Technical identifiers, implementation language and redundant descriptions are not
  shown to students.
- Notes, tests, resources and community links preserve canonical subject/chapter context.

### Planner and Today — “Plan” versus “Do”

- Today is execution-first: anchored timeline, next task and fast complete/reschedule.
- Planner is organization-first: quick capture, tasks, schedule and future structure.
- Use timelines, rows and calendar structure rather than dashboard cards.
- Completion and rescheduling are optimistic and preserve the current day/position.
- Mobile removes desktop multi-column panels and keeps sticky task actions where useful.

### Notes

- Notes are a focused canvas, not a dashboard.
- Search/list and editor may become separate mobile steps.
- Saving is immediate in the interface, with a quiet saved/sync state.
- Editing tools appear contextually; folders and secondary tools move into sheets.
- Typed notes, uploads and stylus/notepad-to-PDF workflows use the same academic context.

### Resources and ICAI updates

- Official ICAI resources/updates are visually and semantically separate from community
  resources.
- Always show source/provenance, academic scope and a working open action.
- Filters apply without a full refresh and move to a sheet on mobile.
- New, changed or unavailable badges are semantic, not decorative.
- Stable resource identity is preserved if a source URL changes.

### Tests

- Tests manage the student’s attempts; do not use test-provider marketing language.
- Keep applicable chapter, add/record attempt and recent attempts prominent.
- Full history and evidence move into detail.
- Scores and states are labelled and accessible without relying on colour.

### Community and Study Buddy

- Community is conversational: rows/channel list, active conversation and composer.
- On mobile show either the channel list or conversation, never both squeezed together.
- Official ICAI content is not mixed into community resources.
- Study Buddy is a private accountability flow based on stable usernames.
- Gamification is restrained and cannot overshadow the current relationship/action.

### Settings and Billing

- Settings is a quiet utility surface grouped by account concern.
- Account, academic profile, appearance, Focus preferences, plan and data/export controls
  are clearly separated.
- It must not look like a product demo or repeat pricing throughout the page.
- Preference changes apply immediately where safe and clearly report failure.

### Admin

- Admin surfaces are operational and dense: tables, rows, filters, statuses, queues and
  audit evidence.
- Prioritize items requiring attention and expose safe actions near their context.
- Mobile converts tables to complete labelled summaries and focused detail/action flows.
- Decorative student-product treatments are minimized.

## Naming and content rules

- Use **Focus**, not “Study timer”, for the timer/session feature.
- Use **Both groups**, not “All groups”.
- Use **Law**, **Costing**, **Audit** and **FM SM** in compact subject selectors/headings.
- Use the full subject name where legal, official or accessibility context requires it.
- Use **Rev. 1**, **Rev. 2**, **Test 1**, **Test 2**—not 1R, 2R, T1 or T2.
- Write short, specific labels for CA students. Avoid slogans, generic productivity copy,
  AI-sounding explanations and text that narrates the interface.
- Never expose internal IDs, architecture terms, sync jargon or implementation status to
  student users.

## Implementation ownership

- `app/styles/tokens.css`: semantic colour, type, spacing, radius, motion and responsive
  tokens.
- `app/styles/components.css`: shared buttons, forms, cards, badges, progress, tabs,
  overlays, menus, states and adaptive primitives.
- `app/styles/shell.css`: desktop sidebar, topbar, account/search controls, mobile bottom
  navigation, grouped navigation and shared route trail.
- Route styles: composition unique to that page, built from canonical tokens and
  primitives.

Do not add another global override layer for a new redesign. When migrating a route,
inspect its active legacy styles, move the intended behavior into the canonical owner,
verify desktop/mobile, then remove only selectors proven to be superseded.

## Definition of agency-quality completion

A screen is ready only when:

- its primary purpose and action are immediately clear;
- its hierarchy is not a uniform card grid;
- every prominent element has a functional reason;
- purple and status colours communicate meaning;
- data and controls align consistently;
- interactions feel immediate and do not unnecessarily reload the page;
- all capabilities remain reachable on mobile through an intentional composition;
- it works at 360, 390 and 430px mobile widths and the 1440px desktop baseline;
- it has usable loading, empty, stale, offline, error and success states;
- keyboard, focus, touch targets, contrast, zoom and reduced motion are supported;
- it looks related to the rest of CA Progress without making every page identical.

When uncertain, remove filler, clarify hierarchy and make the next useful action easier.
