"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { allNavigation, routeIsActive, type ShellArea } from "./navigation-contract";

export function MobileAppBar({ area, homeHref }: { area: ShellArea; homeHref: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const matches = allNavigation(area).filter(item => routeIsActive(item, pathname)).sort((a, b) => b.href.length - a.href.length);
  const active = matches[0];
  const isRoot = pathname === homeHref;
  const label = active?.label ?? (area === "admin" ? "Operations" : "CA Progress");
  const back = () => { if (window.history.length > 1) router.back(); else router.push(homeHref); };
  return <div className="mobile-app-bar mobile-brand">
    {isRoot ? <Link href={homeHref} className="mobile-app-bar__mark" aria-label={`${label} home`}>CP</Link> : <button type="button" className="ui-icon-button mobile-app-bar__back" onClick={back} aria-label="Go back"><Icon name="arrow" size={18}/></button>}
    <span><strong>{label}</strong><small>{area === "admin" ? "CA Progress operations" : "Student workspace"}</small></span>
  </div>;
}
