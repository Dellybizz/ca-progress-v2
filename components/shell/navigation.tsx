"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

export type NavItem = { label: string; href: string; icon: IconName; exact?: boolean };

type StudentNavGroup = {
  key: "study" | "progress" | "resources" | "community" | "account";
  label: string;
  icon: IconName;
  items: NavItem[];
};

export const studentNavigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "home" },
  { label: "Today Plan", href: "/planner/today", icon: "sparkles" },
  { label: "Progress", href: "/progress", icon: "chart" },
  { label: "Study", href: "/study", icon: "timer" },
  { label: "Planner", href: "/planner", icon: "calendar", exact: true },
  { label: "Revision Settings", href: "/planner/revision-settings", icon: "settings" },
  { label: "Forecast", href: "/analytics/forecast", icon: "chart" },
  { label: "Goals", href: "/goals", icon: "target" },
  { label: "Calendar", href: "/calendar", icon: "calendar" },
  { label: "Activity", href: "/activity", icon: "sparkles" },
  { label: "Syllabus", href: "/syllabus", icon: "book" },
  { label: "ICAI Updates", href: "/updates", icon: "bell" },
  { label: "Resources", href: "/resources", icon: "book" },
  { label: "ICAI Resources", href: "/resources/icai", icon: "shield" },
  { label: "Tests", href: "/tests", icon: "tests" },
  { label: "Notes", href: "/notes", icon: "notes" },
  { label: "Community", href: "/community", icon: "community" },
  { label: "Pricing", href: "/pricing", icon: "sparkles" },
  { label: "Billing", href: "/billing", icon: "shield" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

const studentGroups: StudentNavGroup[] = [
  {
    key: "study",
    label: "Study",
    icon: "timer",
    items: [
      { label: "Today Plan", href: "/planner/today", icon: "sparkles" },
      { label: "Study", href: "/study", icon: "timer" },
      { label: "Planner", href: "/planner", icon: "calendar", exact: true },
      { label: "Calendar", href: "/calendar", icon: "calendar" },
    ],
  },
  {
    key: "progress",
    label: "Progress",
    icon: "chart",
    items: [
      { label: "Progress Tracker", href: "/progress", icon: "chart" },
      { label: "Revision Settings", href: "/planner/revision-settings", icon: "settings" },
      { label: "Forecast", href: "/analytics/forecast", icon: "chart" },
      { label: "Goals", href: "/goals", icon: "target" },
      { label: "Tests", href: "/tests", icon: "tests" },
    ],
  },
  {
    key: "resources",
    label: "Resources",
    icon: "book",
    items: [
      { label: "Syllabus", href: "/syllabus", icon: "book" },
      { label: "ICAI Updates", href: "/updates", icon: "bell" },
      { label: "Resources", href: "/resources", icon: "book" },
      { label: "ICAI Resources", href: "/resources/icai", icon: "shield" },
      { label: "Notes", href: "/notes", icon: "notes" },
    ],
  },
  {
    key: "community",
    label: "Community",
    icon: "community",
    items: [
      { label: "Community", href: "/community", icon: "community" },
      { label: "Activity", href: "/activity", icon: "sparkles" },
    ],
  },
  {
    key: "account",
    label: "Account",
    icon: "settings",
    items: [
      { label: "Pricing", href: "/pricing", icon: "sparkles" },
      { label: "Billing", href: "/billing", icon: "shield" },
      { label: "Settings", href: "/settings", icon: "settings" },
    ],
  },
];

export const adminNavigation: NavItem[] = [
  { label: "Admin overview", href: "/admin", icon: "shield", exact: true },
  { label: "Syllabus preview", href: "/admin/syllabus", icon: "book" },
  { label: "ICAI Sync", href: "/admin/icai-sync", icon: "bell" },
  { label: "Resource moderation", href: "/admin/resources/moderation", icon: "notes" },
  { label: "Community moderation", href: "/admin/community/moderation", icon: "community" },
];

function itemIsActive(item: NavItem, pathname: string) {
  const subjectRoute = item.href === "/syllabus" && pathname.startsWith("/subjects/");
  const userResourceRoute = item.href === "/resources" && pathname.startsWith("/resources/") && !pathname.startsWith("/resources/icai");
  const nestedRoute = !item.exact && item.href !== "/dashboard" && item.href !== "/resources" && pathname.startsWith(`${item.href}/`);
  return pathname === item.href || subjectRoute || userResourceRoute || nestedRoute;
}

function NavLink({ item, pathname, compact = false }: { item: NavItem; pathname: string; compact?: boolean }) {
  const active = itemIsActive(item, pathname);
  return (
    <Link
      href={item.href}
      className={`${active ? "is-active" : ""}${compact ? " sidebar-nav__child" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <Icon name={item.icon} size={compact ? 16 : 19}/>
      <span>{item.label}</span>
      {active ? <i className="sidebar-nav__active" aria-hidden="true"/> : null}
    </Link>
  );
}

function StudentDesktopNavigation({ pathname }: { pathname: string }) {
  const activeGroup = useMemo(
    () => studentGroups.find((group) => group.items.some((item) => itemIsActive(item, pathname)))?.key ?? null,
    [pathname],
  );
  const [openGroup, setOpenGroup] = useState<StudentNavGroup["key"] | null>(activeGroup);

  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup);
  }, [activeGroup]);

  const dashboard = studentNavigation[0];

  return (
    <nav className="sidebar-nav sidebar-nav--grouped" aria-label="student navigation">
      <NavLink item={dashboard} pathname={pathname}/>
      <div className="sidebar-nav-groups">
        {studentGroups.map((group) => {
          const expanded = openGroup === group.key;
          const hasActiveItem = group.items.some((item) => itemIsActive(item, pathname));
          return (
            <div className={`sidebar-nav-group${expanded ? " is-open" : ""}${hasActiveItem ? " has-active-item" : ""}`} key={group.key}>
              <button
                type="button"
                className="sidebar-nav-group__trigger"
                aria-expanded={expanded}
                onClick={() => setOpenGroup((current) => current === group.key ? null : group.key)}
              >
                <Icon name={group.icon} size={18}/>
                <span>{group.label}</span>
                <span className="sidebar-nav-group__chevron" aria-hidden="true"><Icon name="arrow" size={13}/></span>
              </button>
              {expanded ? (
                <div className="sidebar-nav-group__items">
                  {group.items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} compact/>)}
                </div>
              ) : null}
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

  return (
    <nav className="sidebar-nav" aria-label="admin navigation">
      {adminNavigation.map((item) => <NavLink key={item.href} item={item} pathname={pathname}/>)}
    </nav>
  );
}
