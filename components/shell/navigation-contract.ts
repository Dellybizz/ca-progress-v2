import type { IconName } from "@/components/ui/icon";

export type ShellArea = "student" | "admin";
export type ShellNavItem = { label: string; shortLabel?: string; description: string; href: string; icon: IconName; exact?: boolean; mobilePrimary?: boolean };
export type ShellNavSection = { label: string; items: readonly ShellNavItem[] };

export const shellNavigation: Record<ShellArea, readonly ShellNavSection[]> = {
  student: [
    { label: "Workspace", items: [
      { label: "Dashboard", shortLabel: "Home", description: "Your study overview", href: "/dashboard", icon: "home", mobilePrimary: true },
      { label: "Today", description: "What needs your attention now", href: "/planner/today", icon: "sparkles", mobilePrimary: true },
      { label: "Study", description: "Start and manage study sessions", href: "/study", icon: "timer", mobilePrimary: true },
      { label: "Progress", description: "Track syllabus completion", href: "/progress", icon: "chart", mobilePrimary: true },
      { label: "Planner", description: "Plan upcoming study work", href: "/planner", icon: "calendar", exact: true },
    ]},
    { label: "Plan & review", items: [
      { label: "Calendar", description: "See your study schedule", href: "/calendar", icon: "calendar" },
      { label: "Revision settings", description: "Control your revision cycle", href: "/planner/revision-settings", icon: "settings" },
      { label: "Analytics", description: "Review patterns and trends", href: "/analytics", icon: "chart", exact: true },
      { label: "Forecast", description: "See your study outlook", href: "/analytics/forecast", icon: "chart" },
      { label: "Goals", description: "Set and review study goals", href: "/goals", icon: "target" },
      { label: "Tests", description: "Track test preparation", href: "/tests", icon: "tests" },
    ]},
    { label: "Knowledge", items: [
      { label: "Syllabus", description: "Browse subjects and chapters", href: "/syllabus", icon: "book" },
      { label: "ICAI updates", description: "See official ICAI changes", href: "/updates", icon: "bell" },
      { label: "Resources", description: "Open saved study resources", href: "/resources", icon: "book", exact: true },
      { label: "ICAI resources", description: "Access official material", href: "/resources/icai", icon: "shield" },
      { label: "Notes", description: "Open your study notes", href: "/notes", icon: "notes" },
    ]},
    { label: "People", items: [
      { label: "Community", description: "Learn with other students", href: "/community", icon: "community" },
      { label: "Study buddy", description: "Study alongside friends", href: "/study-buddy", icon: "community" },
      { label: "Activity", description: "See achievements and rankings", href: "/activity", icon: "sparkles" },
    ]},
  ],
  admin: [
    { label: "Operations", items: [
      { label: "Command center", shortLabel: "Admin", description: "Operational overview", href: "/admin", icon: "shield", exact: true, mobilePrimary: true },
      { label: "System health", shortLabel: "Health", description: "Runtime and service health", href: "/admin/health", icon: "chart", mobilePrimary: true },
      { label: "Control centre", description: "Publish configuration", href: "/admin/control", icon: "settings" },
      { label: "Users", description: "Manage student accounts", href: "/admin/users", icon: "community", mobilePrimary: true },
      { label: "Staff & roles", description: "Manage privileged access", href: "/admin/staff", icon: "shield" },
      { label: "Audit log", description: "Inspect action history", href: "/admin/audit", icon: "notes" },
    ]},
    { label: "Academic & content", items: [
      { label: "Syllabus preview", description: "Review academic structure", href: "/admin/syllabus", icon: "book" },
      { label: "ICAI sync", shortLabel: "ICAI", description: "Manage ICAI updates", href: "/admin/icai-sync", icon: "bell", mobilePrimary: true },
      { label: "Jobs", description: "Inspect background jobs", href: "/admin/jobs", icon: "timer" },
      { label: "Plans", description: "Review product plans", href: "/admin/plans", icon: "sparkles" },
      { label: "Notifications", description: "Review delivery health", href: "/admin/notifications", icon: "bell" },
      { label: "Resource moderation", description: "Review reported resources", href: "/admin/resources/moderation", icon: "notes" },
      { label: "Community moderation", description: "Review community reports", href: "/admin/community/moderation", icon: "community" },
    ]},
  ],
};

export const accountNavigation: readonly ShellNavItem[] = [
  { label: "Profile", description: "Identity and exam context", href: "/settings/profile", icon: "community" },
  { label: "Preferences", description: "Appearance and study settings", href: "/settings", icon: "settings" },
  { label: "Plan & billing", description: "Subscription and invoices", href: "/billing", icon: "shield" },
];

export function allNavigation(area: ShellArea) { return shellNavigation[area].flatMap(section => section.items); }
export function mobileNavigation(area: ShellArea) { return allNavigation(area).filter(item => item.mobilePrimary).slice(0, 4); }
export function routeIsActive(item: Pick<ShellNavItem, "href" | "exact">, pathname: string) {
  if (item.exact) return pathname === item.href;
  if (item.href === "/progress" && /^\/subjects\/[^/]+\/progress(?:\/|$)/.test(pathname)) return true;
  if (item.href === "/syllabus" && pathname.startsWith("/subjects/")) return true;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
