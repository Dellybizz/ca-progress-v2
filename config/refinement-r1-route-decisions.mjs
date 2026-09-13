import { routeContracts } from "./product-consistency-route-contracts.mjs";

const groups = Object.freeze([
  Object.freeze({ id: "daily-study", routes: ["/dashboard", "/dashboard/exam", "/planner/today", "/study"], primaryAction: "Continue the next relevant study action", hierarchy: ["current state", "primary action", "attempt or academic context", "supporting evidence"], transformations: ["keep next action and status", "condense totals", "move history to detail", "defer leaderboard and older updates"] }),
  Object.freeze({ id: "planning-and-insight", routes: ["/activity", "/analytics", "/analytics/forecast", "/calendar", "/goals", "/planner", "/planner/revision-settings", "/progress"], primaryAction: "Inspect one decision or update the current plan", hierarchy: ["decision summary", "filter or action", "scannable records", "explanation"], transformations: ["keep decision and action", "condense metrics", "move filters to a sheet", "defer detailed evidence"] }),
  Object.freeze({ id: "academic-work", routes: ["/chapters/[chapterId]", "/subjects/[subjectSlug]", "/subjects/[subjectSlug]/progress", "/syllabus", "/tests"], primaryAction: "Open the applicable academic item or record progress", hierarchy: ["academic identity", "applicability", "primary learning action", "related records"], transformations: ["keep identity and action", "condense progress metadata", "move related tools to detail", "merge repeated academic labels"] }),
  Object.freeze({ id: "notes-and-resources", routes: ["/notes", "/notes/[id]", "/resources", "/resources/[id]", "/resources/icai", "/updates"], primaryAction: "Find, open or edit trusted study material", hierarchy: ["search or editor", "provenance and academic scope", "primary open or save action", "secondary metadata"], transformations: ["keep search/editor and provenance", "move filters to a sheet", "separate list and detail", "defer full evidence"] }),
  Object.freeze({ id: "community-and-accountability", routes: ["/community", "/community/[channel]", "/study-buddy", "/study-profile/[userId]"], primaryAction: "Enter one conversation or complete one accountability action", hierarchy: ["active relationship or channel", "conversation or action", "safety controls", "history"], transformations: ["keep one active workspace", "move channel or profile detail", "defer history", "remove simultaneous desktop panes"] }),
  Object.freeze({ id: "account-and-commerce", routes: ["/billing", "/pricing", "/settings", "/settings/profile"], primaryAction: "Review or change one account concern", hierarchy: ["current account state", "selected concern", "save or confirm", "supporting explanation"], transformations: ["keep current value and confirmation", "merge account summaries", "move complex edits to focused flows", "remove preview-era duplication"] }),
  Object.freeze({ id: "admin-operations", routes: ["/admin", "/admin/audit", "/admin/community/moderation", "/admin/consistency", "/admin/control", "/admin/health", "/admin/icai-sync", "/admin/icai-sync/data", "/admin/jobs", "/admin/notifications", "/admin/resources/moderation", "/admin/plans", "/admin/staff", "/admin/syllabus", "/admin/users"], primaryAction: "Resolve the highest-priority authorized operation", hierarchy: ["operational status", "attention item", "safe action", "receipt or audit evidence"], transformations: ["keep status and authorized action", "convert tables to labelled summaries", "move filters and detail to sheets/pages", "defer low-priority metrics"] }),
]);

const groupFor = route => groups.find(group => group.routes.includes(route));
export const refinementR1RouteDecisions = Object.freeze(routeContracts.map(contract => {
  const group = groupFor(contract.route);
  if (!group) throw new Error("R1 mobile decision is missing for " + contract.route);
  return Object.freeze({
    route: contract.route, page: contract.page, purpose: contract.purpose,
    referenceOwner: contract.route.startsWith("/admin") ? "linear" : group.id === "notes-and-resources" ? "goodnotes" : group.id === "planning-and-insight" ? "dub" : group.id === "daily-study" ? "amie" : "quizlet",
    primaryAction: group.primaryAction, hierarchy: group.hierarchy, transformations: group.transformations, outcomeParity: true,
  });
}));
export const refinementR1JourneyGroups = groups;

