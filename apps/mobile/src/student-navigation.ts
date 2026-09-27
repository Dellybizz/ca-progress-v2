import type { NativeRoute } from "./runtime";
import type { IconName } from "../../../components/ui/icon";

// The destinations are an app shell over existing CA Progress routes. They do
// not replace the website's pages or create new academic records.
export const studentTabs: ReadonlyArray<{ label: string; route: NativeRoute; icon: IconName }> = [
  { label: "Today", route: "today", icon: "sparkles" },
  { label: "Study", route: "syllabus", icon: "book" },
  { label: "Focus", route: "focus", icon: "timer" },
  { label: "Plan", route: "planner", icon: "calendar" },
  { label: "Progress", route: "progress", icon: "chart" },
];

export function activeStudentTab(route: NativeRoute): NativeRoute | null {
  if (route === "dashboard" || route === "today") return "today";
  if (["syllabus", "notes", "resources", "tests"].includes(route)) return "syllabus";
  if (route === "focus") return "focus";
  if (["planner", "calendar", "goals", "revisionSettings"].includes(route)) return "planner";
  if (["progress", "analytics", "forecast"].includes(route)) return "progress";
  return null; // Explore and account pages are intentionally not mislabelled.
}
