"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/overlay";
import { Icon, type IconName } from "@/components/ui/icon";
import { adminNavigation, studentNavigation } from "./navigation";

const primary: { label: string; href: string; icon: IconName }[] = [
  { label: "Home", href: "/dashboard", icon: "home" },
  { label: "Plan", href: "/planner/today", icon: "sparkles" },
  { label: "Progress", href: "/progress", icon: "chart" },
  { label: "Study", href: "/study", icon: "timer" },
];

const adminPrimary: { label: string; href: string; icon: IconName }[] = [
  { label: "Overview", href: "/admin", icon: "shield" },
  { label: "Members", href: "/admin/members", icon: "community" },
  { label: "Moderate", href: "/admin/community/moderation", icon: "community" },
  { label: "Platform", href: "/admin/platform", icon: "settings" },
];

export function MobileNavigation({ area, authorized = true }: { area: "student" | "admin"; authorized?: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  if (area === "admin" && !authorized) return null;
  if (area === "admin") {
    const moreActive = adminNavigation.some((item) => !adminPrimary.some((primaryItem) => primaryItem.href === item.href) && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
    return <><nav className="mobile-bottom-nav" aria-label="Admin mobile navigation">{adminPrimary.map((item) => { const active=pathname===item.href || (item.href!=="/admin"&&pathname.startsWith(`${item.href}/`)); return <Link key={item.href} href={item.href} className={active?"is-active":""}><Icon name={item.icon}/><span>{item.label}</span></Link>; })}<button onClick={() => setMoreOpen(true)} className={moreActive?"is-active":""}><Icon name="more"/><span>More</span></button></nav><BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Operations tools"><div className="mobile-more-grid">{adminNavigation.filter((item) => !adminPrimary.some((primaryItem) => primaryItem.href===item.href)).map((item) => { const active=pathname===item.href||pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className={active?"is-active":""}><span className="mobile-more-icon"><Icon name={item.icon}/></span><span>{item.label}</span><Icon name="chevron" size={16}/></Link>; })}<Link href="/dashboard" onClick={() => setMoreOpen(false)}><span className="mobile-more-icon"><Icon name="home"/></span><span>Student workspace</span><Icon name="chevron" size={16}/></Link></div></BottomSheet></>;
  }
  const moreActive = ["/planner", "/analytics", "/goals", "/calendar", "/activity", "/syllabus", "/subjects", "/updates", "/tests", "/notes", "/resources", "/community", "/pricing", "/billing", "/settings"].some((href) => pathname.startsWith(href)) && !pathname.startsWith("/planner/today");
  return <><nav className="mobile-bottom-nav" aria-label="Student mobile navigation">{primary.map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={item.icon} size={20}/><span>{item.label}</span></Link>; })}<button onClick={() => setMoreOpen(true)} className={moreActive ? "is-active" : ""} aria-label="More navigation"><Icon name="more" size={22}/><span>More</span></button></nav><BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More from CA Progress"><div className="mobile-more-grid">{studentNavigation.slice(4).map((item) => { const active = pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`)) || (item.href === "/syllabus" && pathname.startsWith("/subjects/")); return <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className={active ? "is-active" : ""}><span className="mobile-more-icon"><Icon name={item.icon}/></span><span>{item.label}</span><Icon name="chevron" size={16}/></Link>; })}</div></BottomSheet></>;
}
