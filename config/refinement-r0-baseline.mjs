import { routeContracts } from "./product-consistency-route-contracts.mjs";

export const refinementR0 = Object.freeze({
  schemaVersion: 1,
  phase: "R0",
  title: "Certified handover and launch baseline",
  production: Object.freeze({
    branch: "phase-12-operations-admin-platform",
    observedCommit: "592260eb4f18306dbbe9f98b18e4462c69d6c297",
    worker: "ca-progress-v2",
    url: "https://ca-progress-v2.habeebaasif622.workers.dev",
    migrationCount: 47,
    latestMigration: "0047_product_consistency_phase10_scanner.sql",
    dataPolicy: "Preserve production data and stable identifiers; migrations remain additive and forward-safe.",
  }),
  certification: Object.freeze({
    programmePhase: 12,
    repositoryGate: "npm run audit:product-consistency:phase12",
    criticalGate: "npm run audit:product-consistency:phase10:gate",
    deploymentGate: "Cloudflare V2 Deploy",
  }),
  viewports: Object.freeze({
    compactPhone: Object.freeze({ width: 360, height: 740 }),
    tallPhone: Object.freeze({ width: 390, height: 844 }),
    tablet: Object.freeze({ width: 768, height: 1024 }),
    desktop: Object.freeze({ width: 1440, height: 1000 }),
  }),
});

export const journeyInventory = Object.freeze([
  ["guest-discovery", "Guest", "/ → /pricing → authentication", "Public shell, pricing and server auth"],
  ["onboarding", "Student", "/onboarding → /dashboard", "Profile and canonical academic context"],
  ["daily-study", "Student", "/dashboard → /planner/today → /study", "Dashboard, planner and study services"],
  ["academic-progress", "Student", "/syllabus → /subjects/[subjectSlug] → /chapters/[chapterId] → /progress", "Academic and progress services"],
  ["resources", "Student", "/resources → /resources/[id]", "Resource authorization and access"],
  ["community", "Student", "/community → /community/[channel]", "Community scope and moderation"],
  ["account", "Student", "/settings → /settings/profile → /billing", "Profile, preferences and billing"],
  ["operations", "Admin", "/admin → health/jobs/consistency/icai-sync", "Admin capabilities and audit events"],
]);

const routeDecision = (route) => {
  if (route.startsWith("/admin")) return ["keep", "move", "Dense tables become task lists/detail sheets; keep operational actions and evidence."];
  if (["/dashboard", "/planner/today", "/study"].includes(route)) return ["keep", "condense", "Lead with today's next action; defer secondary analytics and metadata."];
  if (route.includes("[")) return ["keep", "move", "Keep entity identity and primary action; move related detail into progressive disclosure."];
  if (["/analytics", "/progress", "/activity"].includes(route)) return ["condense", "defer", "Keep status and decisions; defer explanatory and low-frequency breakdowns."];
  if (["/settings", "/settings/profile", "/billing"].includes(route)) return ["merge", "move", "Merge related account sections and use full-screen mobile task flows."];
  return ["keep", "condense", "Keep the route outcome; condense secondary navigation and metadata."];
};

export const mobileRouteInventory = Object.freeze(routeContracts.map((contract) => {
  const [primaryDecision, secondaryDecision, rationale] = routeDecision(contract.route);
  return Object.freeze({
    route: contract.route,
    purpose: contract.purpose,
    primaryAction: contract.purpose,
    primaryDecision,
    secondaryDecision,
    rationale,
    checks: Object.freeze(["44px touch targets", "no application-level horizontal overflow", "keyboard-safe forms", "preserved outcome parity"]),
  });
}));

export const reuseMap = Object.freeze(routeContracts.map(({ route, service, tables, academic, entitlement, offline }) =>
  Object.freeze({ route, service, tables, academic, entitlement, offline })
));

export const performanceBaseline = Object.freeze({
  capturedAt: "2026-09-12T19:45:00Z",
  method: "Unauthenticated HTTPS request from the delivery workspace; timings are diagnostic samples, not an SLA.",
  historicalGuestSeconds: Object.freeze({ min: 1.41, max: 1.74 }),
  samples: Object.freeze([
    Object.freeze({ route: "/", status: 200, ttfbSeconds: 14.375, totalSeconds: 14.418, state: "cold" }),
    Object.freeze({ route: "/pricing", status: 200, ttfbSeconds: 13.694, totalSeconds: 13.875, state: "cold" }),
    Object.freeze({ route: "/", status: 200, ttfbSeconds: 6.143, totalSeconds: 6.187, state: "repeat" }),
  ]),
  authenticatedMethod: "Re-run the same route matrix with a non-production test-session cookie in the credentialed certification workflow.",
  knownOwners: Object.freeze(["Cloudflare Worker SSR", "D1 query fan-out", "private/no-store responses", "page data architecture"]),
});

export const defectRegister = Object.freeze([
  Object.freeze({ id: "R0-P0-01", severity: "critical", state: "closed", surface: "consistency", finding: "Phase 10 critical consistency findings", evidence: "Deployment is blocked by the Phase 10 critical gate." }),
  Object.freeze({ id: "R0-P1-01", severity: "high", state: "open", surface: "performance", finding: "Guest cold TTFB materially exceeds the earlier 1.41–1.74s sample.", impact: "Slow first load", owner: "R17" }),
  Object.freeze({ id: "R0-P1-02", severity: "high", state: "open", surface: "mobile", finding: "Desktop-originated information density remains on several analytics/admin routes.", impact: "Poor scan and thumb ergonomics", owner: "Affected refinement phase" }),
  Object.freeze({ id: "R0-P2-01", severity: "medium", state: "open", surface: "visual", finding: "Legacy page-specific CSS layers still overlap canonical design ownership.", impact: "Regression risk and inconsistent responsive behavior", owner: "R2 and route redesign phases" }),
  Object.freeze({ id: "R0-P2-02", severity: "medium", state: "open", surface: "settings", finding: "Settings retains preview-era composition.", impact: "Production hierarchy is unclear", owner: "R16" }),
  Object.freeze({ id: "R0-P3-01", severity: "low", state: "open", surface: "visual evidence", finding: "Authenticated screenshots require the controlled test account in CI.", impact: "Manual comparison dependency", owner: "R18" }),
]);

