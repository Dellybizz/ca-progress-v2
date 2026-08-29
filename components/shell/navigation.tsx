"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

export type NavItem = { label: string; href: string; icon: IconName; exact?: boolean };
export const studentNavigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "home" }, { label: "Planner", href: "/planner", icon: "calendar" }, { label: "Progress", href: "/progress", icon: "chart" }, { label: "Study", href: "/study", icon: "timer" }, { label: "Tests", href: "/tests", icon: "tests" }, { label: "Notes", href: "/notes", icon: "notes" }, { label: "Resources", href: "/resources", icon: "book" }, { label: "Community", href: "/community", icon: "community" }, { label: "Settings", href: "/settings", icon: "settings" },
];
export const adminNavigation: NavItem[] = [{ label: "Admin overview", href: "/admin", icon: "shield" }];
export function DesktopNavigation({ area }: { area: "student" | "admin" }) {
  const pathname = usePathname(); const nav = area === "admin" ? adminNavigation : studentNavigation;
  return <nav className="sidebar-nav" aria-label={`${area} navigation`}>{nav.map((item) => { const active = pathname === item.href || (!item.exact && item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)); return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={item.icon} size={19}/><span>{item.label}</span>{active ? <i className="sidebar-nav__active" aria-hidden="true"/> : null}</Link>; })}</nav>;
}
