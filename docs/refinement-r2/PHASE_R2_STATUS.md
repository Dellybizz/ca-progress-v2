# Phase R2 status

Status: implementation complete; deployment gates pending.

## Delivered

- System, Light and Dark themes resolve before first paint, follow operating-system changes and synchronize across tabs.
- Indigo, violet, emerald and rose accents plus comfortable/compact density apply through the canonical token layer.
- A device-local Settings appearance panel replaces the old presentation-only preview and provides immediate accessible controls.
- Explicit reduced-motion preference joins the existing operating-system reduced-motion fallback.
- Shared adaptive primitives now cover filter sheets, mobile summaries, native accessible accordions and sticky mobile action areas.
- Shared chart framing requires a text summary and can expose an accessible data table.
- Existing button, input, select, tabs, card, badge, progress, skeleton, empty-state and overlay APIs remain intact.

## Migration boundary

R2 does not bulk-delete route-era CSS or restyle product routes. Later route phases migrate consumers incrementally into these primitives after visual comparison. Appearance is stored on the current device in R2; account-backed preference synchronization can reuse the existing `user_preferences` contract when identity continuity work reaches its owning phase.

Phase R3 has not started.
