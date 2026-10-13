# Approved payment rules rollout

Baseline: payment-system-p5, 9639be9f (12 October 2026). Main is older; do not overwrite the deployed checkout improvements.
Authority: approved-payment-scenarios.md, 47 owner decisions dated 13 October 2026.

| Phase | Scope | Scenario coverage | Completion gate |
| --- | --- | --- | --- |
| 0 | Preserve baseline, repository rule reference, versioned pure policy foundation | All 47 mapped below | Policy boundary tests; no live financial or deletion operations |
| 1 | Dynamic admin pricing, monthly/yearly products, INR 500/1250 annual defaults, immutable quotes | 13–17, 24–27, 31, 38–40, 43 | Admin publish to UI to quote; existing contracts protected; yearly mapping verified |
| 2 | Renewal grace, recovery windows, cancellation, reactivation, daily reminders | 3–5, 18, 21–23, 28–30, 42 | Time-travel tests and replayed verified provider invoices; cancellation race refunds |
| 3 | Changed-method retries, latest successful mandate, upgrades, mandate-first downgrade, frequency switches, routine refunds | 1–2, 6, 19–20, 32–33, 41 | Ownership, double-success/refund, failed replacement, mandate and payment verification tests |
| 4 | Storage quota enforcement, seven-day warnings, important protection, ordered permanent cleanup | 7–12, 44–46 | Dry-run evidence, preview matches deletion, email dedupe, upgrade cancels queued cleanup |
| 5 | Recurring gifts, recipient acceptance, higher-tier eligibility, dual cancellation | 34–37, 47 | Payer/recipient separation; no introductory discounts; verified activation |
| 6 | Mobile/web flows, migration rehearsal, provider capability checks, production release | All 47 | Scenario matrix green, regression checks, deployment health proof |

## Status

Phase 0 foundation implemented in this branch. Changed-payment-method retry restriction removed in backend and frontend as first Phase 3 slice. Remaining integrations are pending; pure policy functions alone do not change renewal or deletion behaviour.

## Release constraints

Keep existing contracts/data intact. Add migrations rather than rewriting applied migrations. Do not enable permanent file cleanup until its warning and execution paths have been verified. Do not promise unlimited provider mandate duration: verify supported cycle limits and provide explicit continuation approval where necessary. Runtime quotes read published admin configuration; annual defaults are seed values only.

## Outstanding implementation-specific choices

Use the decision record boundaries for unspecified details. Do not silently treat them as approved business policy. Never move an expired invoice to a new service period; owner explicitly retained original anchoring even for very late captures.
