"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

export type NavItem = { label: string; href: string; icon: IconName; exact?: boolean };

export const studentNavigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "home" },
  { label: "Planner", href: "/planner", icon: "calendar" },
  { label: "Progress", href: "/progress", icon: "chart" },
  { label: "Study", href: "/study", icon: "timer" },
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
  { label: "Settings", href: "/settings", icon: "settings" },
];

export const adminNavigation: NavItem[] = [
  { label: "Admin overview", href: "/admin", icon: "shield", exact: true },
  { label: "Syllabus preview", href: "/admin/syllabus", icon: "book" },
  { label: "ICAI Sync", href: "/admin/icai-sync", icon: "bell" },
  { label: "Resource moderation", href: "/admin/resources/moderation", icon: "notes" },
];

export function DesktopNavigation({ area }: { area: "student" | "admin" }) {
  const pathname = usePathname();
  const nav = area === "admin" ? adminNavigation : studentNavigation;
  return <nav className="sidebar-nav" aria-label={`${area} navigation`}>{nav.map((item) => {
    const subjectRoute = item.href === "/syllabus" && pathname.startsWith("/subjects/");
    const userResourceRoute = item.href === "/resources" && pathname.startsWith("/resources/") && !pathname.startsWith("/resources/icai");
    const nestedRoute = !item.exact && item.href !== "/dashboard" && item.href !== "/resources" && pathname.startsWith(`${item.href}/`);
    const active = pathname === item.href || subjectRoute || userResourceRoute || nestedRoute;
    return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={item.icon} size={19}/><span>{item.label}</span>{active ? <i className="sidebar-nav__active" aria-hidden="true"/> : null}</Link>;
  })}</nav>;
}
