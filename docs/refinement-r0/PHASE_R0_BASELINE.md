# Phase R0 — Certified handover and launch baseline

Status: implemented and ready for deployment. R1 is explicitly out of scope.

## Certified handover

- Production branch: `phase-12-operations-admin-platform`; no merge to `main`.
- Observed production commit before this baseline: `592260eb4f18306dbbe9f98b18e4462c69d6c297`.
- Runtime: Cloudflare Worker `ca-progress-v2` at `https://ca-progress-v2.habeebaasif622.workers.dev`.
- Migration ledger: 47 additive D1 migrations; latest is `0047_product_consistency_phase10_scanner.sql`.
- Certification owners: Phase 10 critical consistency gate and Phase 12 repository/production certification.
- Production data, user history and stable identifiers remain untouched.

The executable inventory is `config/refinement-r0-baseline.mjs`; `npm run audit:refinement:r0` verifies that its route, migration, mobile, performance and defect evidence is complete.

## Product inventory and reuse boundary

The baseline covers all 46 contracted student/admin routes and eight end-to-end journeys: guest discovery, onboarding, daily study, academic progress, resources, community, account management and operations. Each route retains its current service, table, academic-scope, entitlement and offline owner. R0 creates no parallel implementation and declares no existing feature missing merely because it is inactive or entitlement-gated.

## Visual and mobile baseline

The fixed evidence viewports are 360×740 and 390×844 phones, 768×1024 tablet and 1440×1000 desktop, with light/dark behavior where applicable. Existing design-baseline routes remain the representative screenshot set: dashboard, study, planner, progress, chapter, community, settings and admin.

Every contracted route now has an explicit mobile purpose and primary action plus `keep`, `condense`, `move`, `defer` or `merge` decisions. Mobile acceptance requires 44px touch targets, no application-level horizontal overflow, keyboard-safe forms and outcome parity. Dense desktop tables become lists/detail sheets; secondary analytics move behind progressive disclosure; complex settings/actions become full-screen flows or sheets.

Authenticated screenshots and timings must use the controlled test account in the credentialed certification workflow so no real user data enters artifacts. Guest screenshots and routes are reproducible without credentials.

## Performance baseline

Historical guest samples were 1.41–1.74s. On 2026-09-12, unauthenticated HTTPS samples returned HTTP 200 but showed `/` cold TTFB 14.375s (14.418s total), `/pricing` cold TTFB 13.694s (13.875s total), and repeated `/` TTFB 6.143s (6.187s total). These are diagnostic samples, not an SLA; they identify a high-impact regression candidate for R17. Known owners are Worker SSR, D1 query fan-out, private/no-store caching and page data architecture.

## Prioritized defect register

| Priority | Surface | Finding | Disposition |
| --- | --- | --- | --- |
| P0 | Consistency | Critical consistency findings | Closed by mandatory Phase 10 deployment gate |
| P1 | Performance | Guest cold TTFB exceeds historical baseline | R17 |
| P1 | Mobile | Desktop-originated density remains on analytics/admin routes | Owning route refinement phase |
| P2 | Visual system | Legacy page CSS layers overlap canonical owners | R2 and route refinements |
| P2 | Settings | Preview-era composition remains | R16 |
| P3 | Evidence | Authenticated screenshots depend on controlled CI account | R18 |

## Exit decision

The post-certification product starting point is reproducible: production identity, migration boundary, routes, journeys, owners, visual/mobile evidence rules, performance samples and defects are recorded in executable form. No open critical baseline defect is accepted. R1 may begin only when explicitly requested.
