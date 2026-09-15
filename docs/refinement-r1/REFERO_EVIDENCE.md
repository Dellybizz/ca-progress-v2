# Phase R1 — Refero evidence matrix

## Research method

References are selected by interaction problem, not by overall visual similarity. Refero describes its library as structured research across real screens and flows, and its guidance explicitly separates the product problem, visual reference and implementation constraints. CA Progress therefore adopts bounded behaviours rather than copying whole products.

Sources reviewed on 12 September 2026:

- [Refero research library](https://refero.design/)
- [Refero documentation](https://doc.refero.design/)
- [Refero Styles DESIGN.md library](https://styles.refero.design/)
- [Refero productivity application guidance](https://styles.refero.design/design-styles/productivity-apps)
- [Refero design-context guidance](https://styles.refero.design/ai-agents/design-context)
- [Refero design-prompt guidance](https://styles.refero.design/ai-agents/design-prompts)

Traceability note: Refero's public library exposes stable taxonomy searches but individual screen records require an authenticated research session. This programme records only URLs verified in the public library and never invents screen IDs. Product-specific conclusions are bounded observations, while the public Refero taxonomies remain the reproducible evidence entry points.

| Evidence ID | Verified Refero entry point | Decision supported |
| --- | --- | --- |
| REF-DASHBOARD | https://refero.design/search?page_types[id][]=28&order=trending | Summary hierarchy, dashboard density and restrained metric grouping |
| REF-ONBOARDING | https://refero.design/search/flows?flow_types[id][]=1&order=trending | Short, sequential authentication/onboarding flows |
| REF-DIALOG | https://refero.design/search?page_elements[id][]=81&order=trending | Dialog hierarchy, dismissal and action placement |
| REF-WEB | https://refero.design/search | Web application screens, navigation, tables, filters and account surfaces |
| REF-IOS | https://refero.design/apps/search | Mobile-native priority, full-screen tasks and compact navigation |
| REF-STYLES | https://styles.refero.design/design-styles/productivity-apps | Productivity density and restrained workspace language |

## Accepted evidence

| Reference | Evidence | Problem it solves | Hierarchy, density, navigation and component behaviour | Mobile transformation | Accessibility risk to control | CA Progress ownership |
| --- | --- | --- | --- | --- | --- | --- |
| Quizlet | REF-IOS, REF-WEB | Makes learning state and next study action recognizable | Strong subject identity; moderate educational density; stable subject navigation; explicit state/action components | Keep current activity; defer related modes and history into drill-down | Colour-only mastery state and gamification distraction | Study, Progress, Tests, Chapter Hub |
| Amie | REF-DASHBOARD, REF-IOS | Keeps a busy personal workspace calm | Schedule-led hierarchy; low visual density; stable time navigation; flat paired-action rows | Convert secondary panes to sheets; keep next event/action visible | Low-contrast secondary text and gesture-only actions | Dashboard shell, Calendar, account surfaces |
| Todoist | REF-IOS, REF-WEB | Supports rapid daily planning and completion | Today-first hierarchy; compact list density; stable Today/Upcoming navigation; fast capture and clear completion controls | Sticky add/complete action; details open in sheet/full-screen flow | Destructive swipe actions and small row controls | Today Plan, Planner, Goals |
| Goodnotes | REF-IOS | Protects concentration in a content workspace | Canvas-first hierarchy; tools appear contextually; document navigation stays secondary; disciplined editor controls | Full-screen editor with contextual tools; list and editor become separate steps | Icon-only tools and keyboard/stylus conflicts | Notes, note detail, resource annotation entry |
| Dub | REF-DASHBOARD, REF-WEB | Makes analytics scannable without card soup | Summary-first hierarchy; compact analytical density; filters stay near scope; charts retain progressive detail | Condense metric set; filters move to sheet; chart details remain reachable | Dense labels and chart meaning without text equivalent | Analytics, Forecast, admin summaries |
| Linear | REF-WEB, REF-DIALOG | Handles operational density and repeated actions | Attention-first hierarchy; dense hairline lists; stable workspace navigation; precise table, command and dialog controls | Tables become labelled summary rows with detail sheets | Tiny targets, weak contrast and desktop shortcut assumptions | Admin, moderation, audit, jobs, ICAI operations |

## Rejected patterns

| Pattern | Reason rejected | Replacement rule |
| --- | --- | --- |
| Marketing-sized headings inside authenticated pages | Delays the task and wastes mobile height | Compact page title followed by current state/action |
| Uniform dashboard card grids | Removes importance hierarchy | Use rows, sections, timelines and only real grouping cards |
| Persistent three-column desktop composition on phones | Produces long, noisy pages | Reorder by urgency and move secondary context into drill-down |
| Hidden table columns | Breaks outcome parity | Labelled mobile summary row plus complete detail sheet/page |
| Decorative gradients, glass and floating panels | Conflicts with the neutral educational workspace | Neutral surfaces, hairline borders and semantic colour |
| Product-brand imitation | Makes the product visually inconsistent and derivative | One CA Progress token and component system |

## Normalized synthesis

CA Progress uses Quizlet’s educational clarity inside Amie’s restrained workspace, Todoist’s daily action model, Goodnotes’ focused canvas, and Dub/Linear precision for data-heavy surfaces. No route may blend motifs from multiple references unless the route map names one owner for each distinct interaction problem.
