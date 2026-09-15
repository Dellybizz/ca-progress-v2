# Phase R2 status

Status: implementation complete and reconciled with the certified R0 baseline.

## Delivered

- System, Light and Dark themes resolve before first paint, follow operating-system changes and synchronize across tabs.
- Indigo, violet, emerald and rose accents plus comfortable/compact density apply through the canonical token layer.
- A device-local Settings appearance panel replaces the old presentation-only preview and provides immediate accessible controls.
- Explicit reduced-motion preference joins the existing operating-system reduced-motion fallback.
- Shared adaptive primitives now cover filter sheets, mobile summaries, native accessible accordions and sticky mobile action areas.
- Shared chart framing requires a text summary and can expose an accessible data table.
- Existing button, input, select, tabs, card, badge, progress, skeleton, empty-state and overlay APIs remain intact.
- Shared avatar, list, responsive data-table, menu/popover and error/offline/stale state primitives close the common-control inventory.
- Desktop tables transform into complete labelled mobile summaries rather than hiding fields or forcing page-level horizontal overflow.
- Executable WCAG contrast checks cover primary text, secondary text, primary actions and focus indicators in light and dark themes.

## Migration boundary

R2 does not bulk-delete route-era CSS or restyle product routes. Later route phases migrate consumers incrementally into these primitives after visual comparison. Appearance is stored on the current device in R2; account-backed preference synchronization can reuse the existing `user_preferences` contract when identity continuity work reaches its owning phase.

The legacy migration registry is config/refinement-r1-route-decisions.mjs: route phases replace local controls incrementally and retain working CSS until visual comparison passes. R3 has not started.
