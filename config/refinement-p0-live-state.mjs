export const refinementP0 = Object.freeze({
  phase: "P0",
  auditedAt: "2026-09-15",
  repository: "Dellybizz/ca-progress-v2",
  liveBaseBranch: "hotfix/dark-mode-ae0cb36d",
  baseCommit: "62189a4054a25f5e287cbab954375e1c12c6b563",
  productionUrl: "https://ca-progress-v2.habeebaasif622.workers.dev",
  workers: Object.freeze([
    Object.freeze({ key: "web", name: "ca-progress-v2", config: "wrangler.jsonc" }),
    Object.freeze({ key: "billing", name: "ca-progress-v2-billing", config: "workers/billing/wrangler.jsonc" }),
    Object.freeze({ key: "icai", name: "ca-progress-v2-icai-sync", config: "workers/icai-sync/wrangler.jsonc" }),
  ]),
  database: Object.freeze({
    name: "ca-progress-v2-phase4-shadow",
    config: "wrangler.jsonc",
    latestMigration: "0048_chapter_workspace_controls.sql",
    migrationCount: 48,
  }),
  protectedData: Object.freeze([
    "user IDs", "guest IDs", "academic progress", "study history", "notes",
    "planner data", "subscriptions", "payments", "resource IDs", "ICAI mappings",
    "community data", "uploaded files", "XP and activity history",
  ]),
  nextPhase: "P1 — Admin information architecture and user operations",
});

export const p0CommercialTables = Object.freeze([
  "subscription_plans",
  "plan_policy_versions",
  "plan_policy_publications",
  "subscription_policy_contracts",
  "user_subscriptions",
  "payment_orders",
  "payment_events",
  "subscription_events",
  "entitlement_overrides",
  "plan_promotions",
  "plan_promotion_grants",
  "scheduled_plan_changes",
]);
