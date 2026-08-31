"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

const studentPrimary: { label: string; href: string; icon: IconName; matches: string[] }[] = [
  { label: "Dashboard", href: "/dashboard", icon: "home", matches: ["/dashboard"] },
  { label: "Study", href: "/study", icon: "timer", matches: ["/study", "/planner", "/calendar"] },
  { label: "Progress", href: "/progress", icon: "chart", matches: ["/progress", "/analytics", "/goals", "/tests"] },
  { label: "Resources", href: "/resources", icon: "book", matches: ["/resources", "/syllabus", "/subjects", "/updates", "/notes"] },
  { label: "Community", href: "/community", icon: "community", matches: ["/community", "/activity"] },
];

function isActive(pathname: string, matches: string[]) {
  return matches.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

export function MobileNavigation({ area }: { area: "student" | "admin" }) {
  const pathname = usePathname();

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

  return (
    <nav className="mobile-bottom-nav" aria-label="Student mobile navigation">
      {studentPrimary.map((item) => {
        const active = isActive(pathname, item.matches);
        return (
          <Link key={item.label} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>
            <Icon name={item.icon} size={19}/>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
