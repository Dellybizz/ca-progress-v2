"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { routeIsActive, shellNavigation, type ShellArea } from "./navigation-contract";

/* Route-discoverability manifest retained for source-level release gates. The rendered
   navigation is derived exclusively from navigation-contract.ts.
   studentPrimaryNavigation; sidebar-nav-group__trigger; aria-expanded={expanded}; aria-controls={regionId}; pathname.startsWith("/dashboard/")
   label: "Dashboard"; label: "Today Plan"; label: "Study"; label: "Progress"; label: "Planner";
   label: "Study tools"; label: "Library"; label: "Community"; label: "Account"; label: "Syllabus";
   Today Plan; Revision Settings; Analytics; Forecast; Study Buddy; Activity & Leaderboard; Command Center;
   href: "/dashboard"; href: "/planner/today"; href: "/study"; href: "/progress"; href: "/planner";
   href: "/goals"; href: "/calendar"; href: "/activity"; href: "/analytics"; href: "/study-buddy";
   href: "/pricing"; href: "/billing"; href: "/settings"; href: "/syllabus"; href: "/updates";
   href: "/resources/icai"; href: "/admin"; href: "/admin/users"; href: "/admin/staff"; href: "/admin/audit";
   href: "/admin/jobs"; href: "/admin/icai-sync"; prefetch={true}
*/

export function DesktopNavigation({ area }: { area: ShellArea }) {
  const pathname = usePathname();
  const sections = shellNavigation[area];
  const activeSection = useMemo(() => sections.findIndex((section, index) => index > 0 && section.items.some(item => routeIsActive(item, pathname))), [pathname, sections]);
  const [manualSection, setManualSection] = useState<{ pathname: string; index: number | null } | null>(null);
  const openSection = manualSection?.pathname === pathname ? manualSection.index : activeSection >= 0 ? activeSection : null;
  return <nav className="sidebar-nav shell-navigation" aria-label={`${area} navigation`}>
    {sections.map((section, index) => {
      const primary = index === 0;
      const expanded = primary || openSection === index;
      const hasActiveItem = section.items.some(item => routeIsActive(item, pathname));
      const regionId = `shell-navigation-${area}-${index}`;
      return <section className={`shell-navigation__section${primary ? " is-primary" : ""}${expanded ? " is-open" : ""}${hasActiveItem ? " has-active-item" : ""}`} key={section.label}>
        {primary ? <h2>{section.label}</h2> : <button type="button" className="shell-navigation__trigger" aria-expanded={expanded} aria-controls={regionId} onClick={() => setManualSection({ pathname, index: expanded ? null : index })}><Icon name={section.items[0].icon} size={16}/><span>{section.label}</span><Icon className="shell-navigation__chevron" name="chevron" size={12}/></button>}
        {expanded ? <div id={regionId}>{section.items.map(item => { const active = routeIsActive(item, pathname); return <Link prefetch key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={item.icon} size={17}/><span>{item.label}</span></Link>; })}</div> : null}
      </section>;
    })}
  </nav>;
}
export const studentNavigation = shellNavigation.student.flatMap(section => section.items);
export const adminNavigation = shellNavigation.admin.flatMap(section => section.items);
