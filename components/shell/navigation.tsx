"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

export type NavItem = { label: string; href: string; icon: IconName; exact?: boolean };

type StudentNavGroup = {
  key: "tools" | "library" | "community" | "account";
  label: string;
  icon: IconName;
  items: NavItem[];
};

/* Full route list remains exported for compatibility with search/navigation consumers. */
export const studentNavigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "home" },
  { label: "Today Plan", href: "/planner/today", icon: "sparkles" },
  { label: "Study", href: "/study", icon: "timer" },
  { label: "Progress", href: "/progress", icon: "chart" },
  { label: "Planner", href: "/planner", icon: "calendar", exact: true },
  { label: "Calendar", href: "/calendar", icon: "calendar" },
  { label: "Revision Settings", href: "/planner/revision-settings", icon: "settings" },
  { label: "Analytics", href: "/analytics", icon: "chart", exact: true },
  { label: "Forecast", href: "/analytics/forecast", icon: "chart" },
  { label: "Goals", href: "/goals", icon: "target" },
  { label: "Tests", href: "/tests", icon: "tests" },
  { label: "Syllabus", href: "/syllabus", icon: "book" },
  { label: "ICAI Updates", href: "/updates", icon: "bell" },
  { label: "Resources", href: "/resources", icon: "book" },
  { label: "ICAI Resources", href: "/resources/icai", icon: "shield" },
  { label: "Notes", href: "/notes", icon: "notes" },
  { label: "Community", href: "/community", icon: "community" },
  { label: "Study Buddy", href: "/study-buddy", icon: "community" },
  { label: "Activity & Leaderboard", href: "/activity", icon: "sparkles" },
  { label: "Pricing", href: "/pricing", icon: "sparkles" },
  { label: "Billing", href: "/billing", icon: "shield" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

const studentPrimaryNavigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "home" },
  { label: "Today Plan", href: "/planner/today", icon: "sparkles" },
  { label: "Study", href: "/study", icon: "timer" },
  { label: "Progress", href: "/progress", icon: "chart" },
  { label: "Planner", href: "/planner", icon: "calendar", exact: true },
];

const studentGroups: StudentNavGroup[] = [
  { key: "tools", label: "Study tools", icon: "target", items: [
    { label: "Calendar", href: "/calendar", icon: "calendar" },
    { label: "Revision Settings", href: "/planner/revision-settings", icon: "settings" },
    { label: "Analytics", href: "/analytics", icon: "chart", exact: true },
    { label: "Forecast", href: "/analytics/forecast", icon: "chart" },
    { label: "Goals", href: "/goals", icon: "target" },
    { label: "Tests", href: "/tests", icon: "tests" },
  ] },
  { key: "library", label: "Library", icon: "book", items: [
    { label: "Syllabus", href: "/syllabus", icon: "book" },
    { label: "ICAI Updates", href: "/updates", icon: "bell" },
    { label: "Resources", href: "/resources", icon: "book", exact: true },
    { label: "ICAI Resources", href: "/resources/icai", icon: "shield" },
    { label: "Notes", href: "/notes", icon: "notes" },
  ] },
  { key: "community", label: "Community", icon: "community", items: [
    { label: "Community", href: "/community", icon: "community" },
    { label: "Study Buddy", href: "/study-buddy", icon: "community" },
    { label: "Activity & Leaderboard", href: "/activity", icon: "sparkles" },
  ] },
  { key: "account", label: "Account", icon: "settings", items: [
    { label: "Pricing", href: "/pricing", icon: "sparkles" },
    { label: "Billing", href: "/billing", icon: "shield" },
    { label: "Settings", href: "/settings", icon: "settings" },
  ] },
];

export const adminNavigation: NavItem[] = [
  { label: "Command Center", href: "/admin", icon: "shield", exact: true },
  { label: "System health", href: "/admin/health", icon: "chart" },
  { label: "Control centre", href: "/admin/control", icon: "settings" },
  { label: "Users", href: "/admin/users", icon: "community" },
  { label: "Staff & roles", href: "/admin/staff", icon: "shield" },
  { label: "Audit log", href: "/admin/audit", icon: "notes" },
  { label: "Syllabus preview", href: "/admin/syllabus", icon: "book" },
  { label: "ICAI Sync", href: "/admin/icai-sync", icon: "bell" },
  { label: "Jobs", href: "/admin/jobs", icon: "timer" },
  { label: "Plans", href: "/admin/plans", icon: "sparkles" },
  { label: "Notifications", href: "/admin/notifications", icon: "bell" },
  { label: "Resource moderation", href: "/admin/resources/moderation", icon: "notes" },
  { label: "Community moderation", href: "/admin/community/moderation", icon: "community" },
];

function itemIsActive(item: NavItem, pathname: string) {
  if (item.exact) return pathname === item.href;
  if (item.href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  if (item.href === "/syllabus" && pathname.startsWith("/subjects/")) return true;
  if (item.href === "/resources") return pathname === "/resources" || (pathname.startsWith("/resources/") && !pathname.startsWith("/resources/icai"));
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname, compact = false }: { item: NavItem; pathname: string; compact?: boolean }) {
  const active = itemIsActive(item, pathname);
  return (
    <Link
      prefetch={true}
      href={item.href}
      className={`${active ? "is-active" : ""}${compact ? " sidebar-nav__child" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <Icon name={item.icon} size={compact ? 15 : 17}/>
      <span>{item.label}</span>
    </Link>
  );
}

function StudentDesktopNavigation({ pathname }: { pathname: string }) {
  const activeGroup = useMemo(
    () => studentGroups.find((group) => group.items.some((item) => itemIsActive(item, pathname)))?.key ?? null,
    [pathname],
  );
  const [manualGroup, setManualGroup] = useState<{ pathname: string; key: StudentNavGroup["key"] | null } | null>(null);
  const openGroup = manualGroup?.pathname === pathname ? manualGroup.key : activeGroup;

  return (
    <nav className="sidebar-nav sidebar-nav--grouped" aria-label="Student navigation">
      <div className="sidebar-nav-primary">
        {studentPrimaryNavigation.map((item) => <NavLink key={item.href} item={item} pathname={pathname}/>) }
      </div>
      <div className="sidebar-nav-groups">
        {studentGroups.map((group) => {
          const expanded = openGroup === group.key;
          const hasActiveItem = group.items.some((item) => itemIsActive(item, pathname));
          const regionId = `sidebar-group-${group.key}`;
          return (
            <div className={`sidebar-nav-group${expanded ? " is-open" : ""}${hasActiveItem ? " has-active-item" : ""}`} key={group.key}>
              <button
                type="button"
                className="sidebar-nav-group__trigger"
                aria-expanded={expanded}
                aria-controls={regionId}
                onClick={() => setManualGroup({ pathname, key: expanded ? null : group.key })}
              >
                <Icon name={group.icon} size={16}/>
                <span>{group.label}</span>
                <span className="sidebar-nav-group__chevron" aria-hidden="true"><Icon name="chevron" size={12}/></span>
              </button>
              {expanded ? <div id={regionId} className="sidebar-nav-group__items">{group.items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} compact/>)}</div> : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export function DesktopNavigation({ area }: { area: "student" | "admin" }) {
  const pathname = usePathname();
  if (area === "student") return <StudentDesktopNavigation pathname={pathname}/>;
  return <nav className="sidebar-nav" aria-label="Admin navigation">{adminNavigation.map((item) => <NavLink key={item.href} item={item} pathname={pathname}/>)}</nav>;
}
