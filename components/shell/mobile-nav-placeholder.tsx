"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/overlay";
import { Icon, type IconName } from "@/components/ui/icon";

type MobileSection = {
  key: "study" | "progress" | "resources" | "community";
  label: string;
  icon: IconName;
  matches: string[];
  items: { label: string; description: string; href: string; icon: IconName }[];
};

const studentSections: MobileSection[] = [
  {
    key: "study",
    label: "Study",
    icon: "timer",
    matches: ["/study", "/planner", "/calendar"],
    items: [
      { label: "Today Plan", description: "See what to study today", href: "/planner/today", icon: "sparkles" },
      { label: "Study", description: "Start a focused study session", href: "/study", icon: "timer" },
      { label: "Planner", description: "Plan upcoming study work", href: "/planner", icon: "calendar" },
      { label: "Calendar", description: "See your study schedule", href: "/calendar", icon: "calendar" },
    ],
  },
  {
    key: "progress",
    label: "Progress",
    icon: "chart",
    matches: ["/progress", "/analytics", "/goals", "/tests", "/planner/revision-settings"],
    items: [
      { label: "Progress Tracker", description: "Track chapter and revision progress", href: "/progress", icon: "chart" },
      { label: "Revision Settings", description: "Control your revision cycle", href: "/planner/revision-settings", icon: "settings" },
      { label: "Forecast", description: "See your study outlook", href: "/analytics/forecast", icon: "chart" },
      { label: "Goals", description: "Set and review study goals", href: "/goals", icon: "target" },
      { label: "Tests", description: "Track test preparation", href: "/tests", icon: "tests" },
    ],
  },
  {
    key: "resources",
    label: "Resources",
    icon: "book",
    matches: ["/resources", "/syllabus", "/subjects", "/updates", "/notes"],
    items: [
      { label: "Syllabus", description: "Browse your subjects and chapters", href: "/syllabus", icon: "book" },
      { label: "ICAI Updates", description: "See official ICAI changes", href: "/updates", icon: "bell" },
      { label: "Resources", description: "Open saved study resources", href: "/resources", icon: "book" },
      { label: "ICAI Resources", description: "Access official ICAI material", href: "/resources/icai", icon: "shield" },
      { label: "Notes", description: "Open your study notes", href: "/notes", icon: "notes" },
    ],
  },
  {
    key: "community",
    label: "Community",
    icon: "community",
    matches: ["/community", "/activity"],
    items: [
      { label: "Community", description: "Talk and learn with other students", href: "/community", icon: "community" },
      { label: "Activity", description: "See recent community activity", href: "/activity", icon: "sparkles" },
    ],
  },
];

function isActive(pathname: string, matches: string[]) {
  return matches.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

export function MobileNavigation({ area }: { area: "student" | "admin" }) {
  const pathname = usePathname();
  const [openSection, setOpenSection] = useState<MobileSection["key"] | null>(null);

  if (area === "admin") {
    return (
      <nav className="mobile-bottom-nav" aria-label="Admin mobile navigation">
        <Link href="/admin" className={pathname === "/admin" ? "is-active" : ""}><Icon name="shield"/><span>Admin</span></Link>
        <Link href="/admin/syllabus" className={pathname.startsWith("/admin/syllabus") ? "is-active" : ""}><Icon name="book"/><span>Syllabus</span></Link>
        <Link href="/admin/icai-sync" className={pathname.startsWith("/admin/icai-sync") ? "is-active" : ""}><Icon name="bell"/><span>ICAI</span></Link>
        <Link href="/admin/resources/moderation" className={pathname.startsWith("/admin/resources/moderation") ? "is-active" : ""}><Icon name="notes"/><span>Resources</span></Link>
        <Link href="/dashboard"><Icon name="home"/><span>Student</span></Link>
      </nav>
    );
  }

  const selectedSection = studentSections.find((section) => section.key === openSection) ?? null;

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Student mobile navigation">
        <Link href="/dashboard" className={pathname === "/dashboard" ? "is-active" : ""} aria-current={pathname === "/dashboard" ? "page" : undefined}>
          <Icon name="home" size={19}/><span>Dashboard</span>
        </Link>
        {studentSections.map((section) => {
          const active = isActive(pathname, section.matches);
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setOpenSection(section.key)}
              className={active ? "is-active" : ""}
              aria-label={`Open ${section.label} options`}
              aria-haspopup="dialog"
            >
              <Icon name={section.icon} size={19}/><span>{section.label}</span>
            </button>
          );
        })}
      </nav>

      <BottomSheet
        open={Boolean(selectedSection)}
        onClose={() => setOpenSection(null)}
        title={selectedSection ? selectedSection.label : "Section"}
      >
        {selectedSection ? (
          <div className="mobile-section-menu">
            <p className="mobile-section-menu__intro">Choose where you want to go.</p>
            <div className="mobile-section-menu__list">
              {selectedSection.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpenSection(null)}
                    className={active ? "is-active" : ""}
                  >
                    <span className="mobile-section-menu__icon"><Icon name={item.icon} size={18}/></span>
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                    <Icon name="chevron" size={15}/>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}
