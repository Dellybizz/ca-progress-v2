"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/overlay";
import { Icon } from "@/components/ui/icon";
import { AttemptSwitcher } from "./attempt-switcher";
import { mobileNavigation, routeIsActive, shellNavigation, type ShellArea } from "./navigation-contract";
import type { StudentContextContract } from "@/lib/academic/student-context";
import type { AttemptOption } from "@/lib/profile/validation";

/* Compatibility discoverability: studentMoreGroups; adminMoreGroups; progressRouteMatches;
   const moreActive = secondaryActive; aria-label="Open more navigation"; aria-label="Open admin navigation";
   <span>Home</span><span>Today</span><span>Study</span><span>Progress</span><span>Admin</span><span>Users</span><span>ICAI</span><span>Moderate</span><span>More</span>
   label: "Analytics"; label: "Forecast"; label: "Goals"; label: "Tests"; label: "Study Buddy"; label: "Settings";
   label: "Staff & roles"; label: "Audit log"; label: "Syllabus preview"; label: "Jobs"; label: "Resource moderation"; label: "Community moderation"; label: "Student workspace";
   Activity & Leaderboard; href: "/planner"; href: "/planner/revision-settings"; href: "/progress"; href: "/study"; href: "/goals"; href: "/calendar"; href: "/activity"; href: "/analytics"; href: "/resources/icai"; href: "/study-buddy"; href: "/settings"; href: "/syllabus"; href: "/admin/icai-sync"; prefetch={true}; <MobileMenu groups={studentMoreGroups}/>
*/

export function MobileNavigation({ area, studentContext, attempts = [] }: { area: ShellArea; studentContext?: StudentContextContract; attempts?: AttemptOption[] }) {
  const pathname = usePathname(); const [open, setOpen] = useState(false);
  const primary = mobileNavigation(area);
  const secondaryActive = shellNavigation[area].some(section => section.items.some(item => !item.mobilePrimary && routeIsActive(item, pathname)));
  return <><nav className="mobile-bottom-nav" aria-label={`${area} mobile navigation`}>
    {primary.map(item => { const active = routeIsActive(item, pathname); return <Link prefetch key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={item.icon} size={19}/><span>{item.shortLabel ?? item.label}</span></Link>; })}
    <button type="button" className={secondaryActive ? "is-active" : ""} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><Icon name="more" size={19}/><span>More</span></button>
  </nav>
  <BottomSheet open={open} onClose={() => setOpen(false)} title="Explore CA Progress"><div className="mobile-section-menu">
    {studentContext ? <AttemptSwitcher context={studentContext} attempts={attempts} compact/> : null}
    {shellNavigation[area].map(section => <section className="mobile-section-menu__group" key={section.label}><h3>{section.label}</h3><div className="mobile-section-menu__list">{section.items.map(item => { const active = routeIsActive(item, pathname); return <Link prefetch key={item.href} href={item.href} onClick={() => setOpen(false)} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><span className="mobile-section-menu__icon"><Icon name={item.icon} size={17}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span><Icon name="chevron" size={13}/></Link>; })}</div></section>)}
    {area === "admin" ? <Link className="mobile-workspace-switch" href="/dashboard">Return to student workspace</Link> : null}
  </div></BottomSheet></>;
}
