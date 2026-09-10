export const designBaseline = Object.freeze({
  schemaVersion: 1,
  programme: "CA Progress agency-quality UI programme",
  baselineSha: "9e991b08c413240e070119c42ec18aeefa8d041b",
  note: "Phase 0 was retrofitted after design Phases 1 and 2. This is the canonical post-Phase-2 baseline, not a reconstruction of the earlier UI.",
  viewports: Object.freeze({
    desktop: Object.freeze({ width: 1440, height: 1000 }),
    mobile: Object.freeze({ width: 390, height: 844 }),
  }),
});

const route = (id, pathname, page, purpose, cssOwners, focus, risks = []) => Object.freeze({
  id,
  pathname,
  page,
  purpose,
  cssOwners: Object.freeze(cssOwners),
  focus: Object.freeze(focus),
  risks: Object.freeze(risks),
});

export const designBaselineRoutes = Object.freeze([
  route(
    "dashboard",
    "/dashboard",
    "app/(student)/dashboard/page.tsx",
    "Daily student command centre: next action, progress context, exam context and current study momentum.",
    [
      "app/styles/dashboard.css",
      "app/styles/student-dashboard.css",
      "app/styles/dashboard-clean.css",
      "app/styles/dashboard-clarity.css",
      "app/styles/dashboard-balanced.css",
      "app/styles/dashboard-character.css",
    ],
    ["primary next action", "study/syllabus progress", "exam countdown", "leaderboard", "ICAI updates"],
    ["Multiple generations of dashboard CSS remain globally stacked and must be consolidated only after route-by-route visual migration."],
  ),
  route(
    "study",
    "/study",
    "app/(student)/study/page.tsx",
    "Focused study-session workspace with timer, academic context and session actions.",
    ["app/styles/phase6.css", "app/styles/surfaces.css", "app/styles/study-clarity.css", "app/styles/study-layout-refine.css"],
    ["single study action", "timer legibility", "subject/chapter context", "session state"],
    ["Later study refinements currently override older phase-level surface rules."],
  ),
  route(
    "planner",
    "/planner",
    "app/(student)/planner/page.tsx",
    "Planning workspace for tasks, schedule and upcoming academic work.",
    ["app/styles/phase6.css", "app/styles/surfaces.css", "app/styles/planner-clarity.css", "app/styles/planner-mobile-final.css", "app/styles/planner-desktop-layout-fix.css"],
    ["task hierarchy", "calendar/schedule clarity", "quick planning", "responsive density"],
    ["Planner currently relies on separate mobile and desktop patch files in addition to its main clarity layer."],
  ),
  route(
    "progress",
    "/progress",
    "app/(student)/progress/page.tsx",
    "Academic progress tracker across subjects, chapters and revision state.",
    ["app/styles/progress.css", "app/styles/academic.css", "app/styles/surfaces.css"],
    ["overall completion", "subject hierarchy", "chapter status", "revision readiness"],
  ),
  route(
    "chapter",
    "/chapters/[chapterId]",
    "app/(student)/chapters/[chapterId]/page.tsx",
    "Chapter workspace joining study progress, notes and resources around one academic unit.",
    ["app/styles/academic.css", "app/styles/chapter-hub.css"],
    ["chapter identity", "progress state", "next study action", "notes/resources"],
  ),
  route(
    "community",
    "/community",
    "app/(student)/community/page.tsx",
    "Student community entry point for scoped channels, activity and peer interaction.",
    ["app/styles/phase7.css", "app/styles/product-phase7-community.css"],
    ["channel discovery", "conversation hierarchy", "identity", "moderation-safe states"],
  ),
  route(
    "settings",
    "/settings",
    "app/(student)/settings/page.tsx",
    "Account, academic profile, billing and export settings.",
    ["app/styles/surfaces.css", "app/styles/phase10.css", "app/styles/phase11.css", "app/styles/phase11-lock.css"],
    ["settings grouping", "account context", "plan state", "data controls"],
    ["The route still includes ProductPreviewPage content and several phase-era style layers; later redesign should replace preview-like presentation with production settings composition."],
  ),
  route(
    "admin",
    "/admin",
    "app/(admin)/admin/page.tsx",
    "Operational command centre for user, staff, ICAI, jobs and audit attention states.",
    ["app/styles/shell-phase2.css"],
    ["operational health", "attention queue", "owner workspaces", "dense utility navigation"],
    ["The admin overview still carries substantial inline React styles, so its visual ownership is partly outside the stylesheet system."],
  ),
]);

export const globalDesignOwners = Object.freeze([
  "app/styles/tokens.css",
  "app/styles/components.css",
  "app/styles/shell-phase2.css",
]);

export const designPrinciples = Object.freeze([
  "One visual grammar across the product; page-specific composition may vary by job.",
  "Use typography, spacing and separators before adding containers.",
  "Use cards only when a real grouping boundary is useful; avoid card soup.",
  "Use CA purple for actions, selection and brand identity, not decoration.",
  "Prefer 8-12px product radii; large radii are exceptional.",
  "Prefer borders over elevation; ordinary cards and controls do not float on hover.",
  "No glassmorphism, decorative blobs, generic gradients or fake smart widgets.",
  "Status colours carry semantic meaning only.",
  "Character comes from CA-specific workflows, copy and occasional purposeful illustration.",
  "Mobile is intentionally composed, not merely a compressed desktop layout.",
]);
