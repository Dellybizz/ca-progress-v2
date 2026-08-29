"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/overlay";
import { Icon, type IconName } from "@/components/ui/icon";
import { studentNavigation } from "./navigation";

const primary: { label: string; href: string; icon: IconName }[] = [{ label: "Home", href: "/dashboard", icon: "home" }, { label: "Plan", href: "/planner", icon: "calendar" }, { label: "Progress", href: "/progress", icon: "chart" }, { label: "Study", href: "/study", icon: "timer" }];
export function MobileNavigation({ area }: { area: "student" | "admin" }) {
  const pathname = usePathname(); const [moreOpen, setMoreOpen] = useState(false);
  if (area === "admin") return <nav className="mobile-bottom-nav" aria-label="Admin mobile navigation"><Link href="/admin" className="is-active"><Icon name="shield"/><span>Admin</span></Link><Link href="/dashboard"><Icon name="home"/><span>Student</span></Link></nav>;
  const moreActive = ["/tests", "/notes", "/resources", "/community", "/settings"].some((href) => pathname.startsWith(href));
  return <><nav className="mobile-bottom-nav" aria-label="Student mobile navigation">{primary.map((item) => { const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={item.icon} size={20}/><span>{item.label}</span></Link>; })}<button onClick={() => setMoreOpen(true)} className={moreActive ? "is-active" : ""} aria-label="More navigation"><Icon name="more" size={22}/><span>More</span></button></nav><BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More from CA Progress"><div className="mobile-more-grid">{studentNavigation.slice(4).map((item) => <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className={pathname.startsWith(item.href) ? "is-active" : ""}><span className="mobile-more-icon"><Icon name={item.icon}/></span><span>{item.label}</span><Icon name="chevron" size={16}/></Link>)}</div></BottomSheet></>;
}
