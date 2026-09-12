# Phase R3 — Shared shell and continuity

Status: implemented and release-gated on `phase-12-operations-admin-platform`.

## Delivered

- One navigation contract drives desktop, mobile and command search destinations.
- Authenticated identity is resolved on the server and remains stable across navigation.
- Desktop uses a restrained 248px workspace rail with grouped destinations, account identity and canonical attempt selection.
- Mobile is independently composed around four frequent destinations plus a secondary sheet; it does not compress the desktop rail.
- Attempt options are limited to valid published level/group mappings and refresh all dependent server surfaces after a successful change.
- Search, notifications and account share one mutually exclusive surface state.
- Modal, drawer, sheet and account popover close on outside interaction, Escape, selection and route change, with focus restoration.
- Existing logout/session-expiration/server-revocation paths remain unchanged.

## Design basis

Refero dashboard and product-shell references were used for hierarchy rather than imitation: stable wayfinding, quiet hairline separation, compact but readable density, restrained active states and a command-search affordance. Decorative gradients, hover lift and repeated floating cards were excluded from the shell.

## Verification

- TypeScript: pass
- ESLint: pass
- Repository tests: 649/649 pass
- Next.js production build: pass

## Boundary

R3 does not redesign Dashboard or any route body. Page-by-page transformation begins in the following refinement phase.
