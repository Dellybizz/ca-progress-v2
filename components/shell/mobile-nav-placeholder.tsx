"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/overlay";
import { Icon, type IconName } from "@/components/ui/icon";

type MobileNavItem = { label: string; description: string; href: string; icon: IconName; exact?: boolean };
type MobileMoreGroup = { label: string; items: MobileNavItem[] };

const moreGroups: MobileMoreGroup[] = [
  { label: "Plan & tools", items: [
    { label: "Planner", description: "Plan upcoming study work", href: "/planner", icon: "calendar", exact: true },
    { label: "Calendar", description: "See your study schedule", href: "/calendar", icon: "calendar" },
    { label: "Revision Settings", description: "Control your revision cycle", href: "/planner/revision-settings", icon: "settings" },
    { label: "Forecast", description: "See your study outlook", href: "/analytics/forecast", icon: "chart" },
    { label: "Goals", description: "Set and review study goals", href: "/goals", icon: "target" },
    { label: "Tests", description: "Track test preparation", href: "/tests", icon: "tests" },
  ] },
  { label: "Library", items: [
    { label: "Syllabus", description: "Browse subjects and chapters", href: "/syllabus", icon: "book" },
    { label: "ICAI Updates", description: "See official ICAI changes", href: "/updates", icon: "bell" },
    { label: "Resources", description: "Open saved study resources", href: "/resources", icon: "book", exact: true },
    { label: "ICAI Resources", description: "Access official ICAI material", href: "/resources/icai", icon: "shield" },
    { label: "Notes", description: "Open your study notes", href: "/notes", icon: "notes" },
  ] },
  { label: "Community", items: [
    { label: "Community", description: "Talk and learn with other students", href: "/community", icon: "community" },
    { label: "Study Buddy", description: "Study alongside friends", href: "/study-buddy", icon: "community" },
    { label: "Activity & Leaderboard", description: "See XP, achievements and rankings", href: "/activity", icon: "sparkles" },
  ] },
  { label: "Account", items: [
    { label: "Pricing", description: "Compare available plans", href: "/pricing", icon: "sparkles" },
    { label: "Billing", description: "Manage your subscription", href: "/billing", icon: "shield" },
    { label: "Settings", description: "Manage your preferences", href: "/settings", icon: "settings" },
  ] },
];

function routeMatches(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNavigation({ area }: { area: "student" | "admin" }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  if (area === "admin") {
    return (
      <nav className="mobile-bottom-nav" aria-label="Admin mobile navigation">
        <Link prefetch={true} href="/admin" className={pathname === "/admin" ? "is-active" : ""}><Icon name="shield" size={18}/><span>Admin</span></Link>
        <Link prefetch={true} href="/admin/syllabus" className={pathname.startsWith("/admin/syllabus") ? "is-active" : ""}><Icon name="book" size={18}/><span>Syllabus</span></Link>
        <Link prefetch={true} href="/admin/icai-sync" className={pathname.startsWith("/admin/icai-sync") ? "is-active" : ""}><Icon name="bell" size={18}/><span>ICAI</span></Link>
        <Link prefetch={true} href="/admin/resources/moderation" className={pathname.startsWith("/admin/resources/moderation") ? "is-active" : ""}><Icon name="notes" size={18}/><span>Resources</span></Link>
        <Link prefetch={true} href="/dashboard"><Icon name="home" size={18}/><span>Student</span></Link>
      </nav>
    );
  }

  const todayActive = routeMatches(pathname, "/planner/today");
  const studyActive = routeMatches(pathname, "/study");
  const progressActive = ["/progress", "/analytics", "/goals", "/tests", "/planner/revision-settings"].some((href) => routeMatches(pathname, href));
  const secondaryActive = moreGroups.some((group) => group.items.some((item) => routeMatches(pathname, item.href, item.exact)));
  const moreActive = secondaryActive && !todayActive && !studyActive && !progressActive;

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Student mobile navigation">
        <Link prefetch={true} href="/dashboard" className={pathname === "/dashboard" ? "is-active" : ""} aria-current={pathname === "/dashboard" ? "page" : undefined}>
          <Icon name="home" size={18}/><span>Home</span>
        </Link>
        <Link prefetch={true} href="/planner/today" className={todayActive ? "is-active" : ""} aria-current={todayActive ? "page" : undefined}>
          <Icon name="sparkles" size={18}/><span>Today</span>
        </Link>
        <Link prefetch={true} href="/study" className={studyActive ? "is-active" : ""} aria-current={studyActive ? "page" : undefined}>
          <Icon name="timer" size={18}/><span>Study</span>
        </Link>
        <Link prefetch={true} href="/progress" className={progressActive ? "is-active" : ""} aria-current={pathname.startsWith("/progress") ? "page" : undefined}>
          <Icon name="chart" size={18}/><span>Progress</span>
        </Link>
        <button type="button" className={moreActive ? "is-active" : ""} onClick={() => setMoreOpen(true)} aria-label="Open more navigation" aria-haspopup="dialog">
          <Icon name="more" size={18}/><span>More</span>
        </button>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="mobile-section-menu">
          <p className="mobile-section-menu__intro">All CA Progress tools, organised by purpose.</p>
          {moreGroups.map((group) => (
            <section className="mobile-section-menu__group" key={group.label} aria-label={group.label}>
              <h3>{group.label}</h3>
              <div className="mobile-section-menu__list">
                {group.items.map((item) => {
                  const active = routeMatches(pathname, item.href, item.exact);
                  return (
                    <Link
                      prefetch={true}
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={active ? "is-active" : ""}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="mobile-section-menu__icon"><Icon name={item.icon} size={17}/></span>
                      <span><strong>{item.label}</strong><small>{item.description}</small></span>
                      <Icon name="chevron" size={14}/>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
